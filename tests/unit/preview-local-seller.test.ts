import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = resolve(import.meta.dirname, '../..');
// Execute route selection without loading any real auth, settings or database modules.
function route(file: string) {
  const source = readFileSync(resolve(root, file), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const compiledRoute = { exports: {} as { default: (props: unknown) => Promise<unknown> } };
  const forbidden = () => { throw new Error('production dependency called'); };
  const requireStub = (id: string) => {
    if (id === 'react/jsx-runtime') return { jsx: (type: unknown) => type, jsxs: (type: unknown) => type };
    if (id.includes('preview-local-entry')) return { PreviewLocalNewAd: 'local-form', PreviewLocalSeller: 'local-dashboard' };
    if (id.includes('preview-sandbox')) return { isPreviewSandbox: () => process.env.PREVIEW_SANDBOX === 'true' };
    if (id === 'next/navigation') return { notFound: () => { throw new Error('not-found'); }, redirect: forbidden };
    return new Proxy({}, { get: () => forbidden });
  };
  new Function('require', 'module', 'exports', output)(requireStub, compiledRoute, compiledRoute.exports);
  return compiledRoute.exports.default;
}

afterEach(() => vi.unstubAllEnvs());
describe('original-shell local preview integration', () => {
  it('renders an empty local dashboard without fixture identity, metrics or payment links', async () => {
    const { PreviewLocalSeller, PreviewLocalNewAd } = await import('../../src/components/preview-local-entry');
    const html = renderToStaticMarkup(createElement(PreviewLocalSeller));
    expect(html).toContain('لا توجد إعلانات هنا بعد');
    expect(html).toContain('هذا المتصفح فقط');
    expect(html).not.toMatch(/دار الأثاث|1,248|محادثات جديدة|account\/credit|store\/dar|href="\/messages/);
    expect(html).not.toContain('seller-promote-button');
    expect(renderToStaticMarkup(createElement(PreviewLocalNewAd))).toContain('أقسام إضافة الإعلان');
  });
  it('returns the local form before auth/settings/database calls', async () => {
    vi.stubEnv('PREVIEW_READ_ONLY', 'true');
    await expect(route('src/app/ads/new/page.tsx')({ searchParams: Promise.resolve({}) })).resolves.toBe('local-form');
  });
  it('keeps the original route when the preview flag is not exactly true', async () => {
    vi.stubEnv('PREVIEW_READ_ONLY', 'false');
    await expect(route('src/app/ads/new/page.tsx')({ searchParams: Promise.resolve({}) })).rejects.toThrow('production dependency called');
  });
  it('only exposes the browser-local dashboard in preview mode', async () => {
    const file = 'src/app/seller/page.tsx';
    expect(existsSync(resolve(root, file))).toBe(true);
    vi.stubEnv('PREVIEW_READ_ONLY', 'true');
    await expect(route(file)({})).resolves.toBe('local-dashboard');
    vi.stubEnv('PREVIEW_READ_ONLY', 'false');
    await expect(route(file)({})).rejects.toThrow('not-found');
  });
  it('has no market snapshot, production service, AppShell or unresolved alias in the client graph', () => {
    const entry = resolve(root, 'src/components/preview-local-entry.tsx');
    expect(existsSync(entry)).toBe(true);
    const visited = new Set<string>();
    function visit(file: string) {
      if (visited.has(file)) return;
      visited.add(file);
      expect(file).not.toMatch(/demo-data|snapshot|app-shell|src[\\/]lib[\\/](auth|prisma|wallet)/);
      const source = readFileSync(file, 'utf8');
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      for (const statement of ast.statements) {
        if ((!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const id = statement.moduleSpecifier.text;
        if (!id.startsWith('.') && !id.startsWith('@/')) continue;
        const base = id.startsWith('@/') ? resolve(root, 'src', id.slice(2)) : resolve(dirname(file), id);
        const target = [base, base+'.ts', base+'.tsx', base+'.json'].find(existsSync);
        expect(target, `${file}: ${id}`).toBeTruthy();
        if (target && !target.endsWith('.css')) visit(target);
      }
    }
    visit(entry);
  });
});
