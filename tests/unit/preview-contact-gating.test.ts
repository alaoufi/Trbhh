import {readFileSync} from 'node:fs';
import React from 'react';
import ts from 'typescript';
import {afterEach, expect, it, vi} from 'vitest';
import {Footer} from '../../src/components/footer';

afterEach(() => {vi.unstubAllEnvs(); vi.unstubAllGlobals();});
function source(file: string) {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function find(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node | undefined {
  if (predicate(root)) return root;
  return ts.forEachChild(root, child => find(child, predicate));
}

it('homepage setting cannot enable real contacts in sandbox; normal mode respects the setting', async () => {
  const root = source('src/app/page.tsx');
  const declaration = find(root, node => ts.isVariableDeclaration(node) && node.name.getText(root) === 'homeActionsOn') as ts.VariableDeclaration;
  const evaluate = new (Object.getPrototypeOf(async () => {}).constructor)('isPreviewSandbox', 'getSettingBool', `return ${declaration.initializer!.getText(root)}`);
  expect(await evaluate(() => true, async () => true)).toBe(false);
  expect(await evaluate(() => false, async () => true)).toBe(true);
  expect(await evaluate(() => false, async () => false)).toBe(false);
});

it('footer retains phone text but renders no telephone link in sandbox', () => {
  vi.stubGlobal('React', React);
  const phones = (node: React.ReactNode): string[] => {
    if (Array.isArray(node)) return node.flatMap(phones);
    if (!React.isValidElement<{href?: string; children?: React.ReactNode}>(node)) return [];
    return [...(node.type === 'a' && node.props.href?.startsWith('tel:') ? [node.props.href] : []), ...phones(node.props.children)];
  };
  const text = (node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(text).join('');
    return React.isValidElement<{children?: React.ReactNode}>(node) ? text(node.props.children) : '';
  };
  vi.stubEnv('PREVIEW_SANDBOX', 'true');
  expect(phones(Footer())).toEqual([]);
  expect(text(Footer())).toContain('00966500785596');
  vi.stubEnv('PREVIEW_SANDBOX', 'false');
  expect(phones(Footer())).toEqual(['tel:00966500785596']);
});

it('ad sharing has a sandbox guard while remaining enabled normally', () => {
  const root = source('src/app/ads/[id]/page.tsx');
  const share = find(root, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(root) === 'ShareButtons');
  let parent = share?.parent;
  while (parent && !(ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)) parent = parent.parent;
  expect(parent, 'ShareButtons must be inside a rendering guard').toBeDefined();
  const condition = (parent as ts.BinaryExpression).left.getText(root);
  const evaluate = new Function('isPreviewSandbox', `return ${condition}`);
  expect(evaluate(() => true)).toBe(false);
  expect(evaluate(() => false)).toBe(true);
});
