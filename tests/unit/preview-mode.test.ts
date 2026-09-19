import { existsSync, readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import ts from 'typescript';

const base = `${process.cwd()}/src/`;

it('provides an explicit, testable preview gate', async () => {
  expect(existsSync(`${base}lib/preview-mode.ts`)).toBe(true);
  const { isPreviewReadOnly, previewRequestAllowed } = await import('../../src/lib/preview-mode');
  for (const value of [undefined, '', 'false', '1', 'TRUE']) {
    expect(isPreviewReadOnly(value)).toBe(false);
  }
  expect(isPreviewReadOnly('true')).toBe(true);
  const allowed = ['/', '/search?q=test', '/requests', '/ads/123', '/ads/new/', '/seller', '/guide', '/guide/store', '/guide/how/add-ad', '/robots.txt', '/logo-header.png', '/placeholder-ad.svg', '/_next/static/chunks/app.js', '/media/uploads/photo.jpg', '/_next/image?url=%2Fmedia%2Fuploads%2Fphoto.jpg&w=640&q=75'];
  for (const path of allowed) {
    for (const method of ['GET', 'HEAD']) expect(previewRequestAllowed(method, path), path).toBe(true);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE']) expect(previewRequestAllowed(method, path), `${method} ${path}`).toBe(false);
  }
  for (const path of ['/admin', '/login', '/logout', '/account', '/account/topup', '/api/search/suggest', '/api/pay/final/x', '/api/pay/callback/x', '/api/ad-contact', '/promo/1/go', '/classified/1/go', '/r/1', '/companies/1', '/ads/0', '/ads/-1', '/ads/1/edit', '/seller/anything', '/sw.js', '/manifest.webmanifest', '/unknown.png', '/media/../secret.jpg', '/media/a%2fb.jpg', '/%61dmin', '/ads/%31', '//ads/1', '/ads\\1', '/ads/1;admin', '/ads/1%00', '/_next/image?url=https://example.com/a.jpg', '/_next/image?url=%2Fapi%2Fpay%2Ffinal%2Fx', '/_next/image?url=%252Fmedia%252Fa.jpg', '/_next/static/../server/a.js']) {
    expect(previewRequestAllowed('GET', path), path).toBe(false);
  }
});

// Execute the real function's first statement in isolation: any dependency
// access before the guard fails, without importing DB/network dependencies.
const guards: [string, string, unknown][] = [
  ['data/schema-sync.ts', 'ensureSchema', undefined],
  ['lib/packages.ts', 'ensure', undefined],
  ['lib/packages.ts', 'sweepExpiredFeatured', undefined],
  ['lib/promos.ts', 'ensure', undefined],
  ['lib/promos.ts', 'sweepExpired', undefined],
  ['lib/promos.ts', 'recordPromoClick', undefined],
  ['lib/data.ts', 'sweepOldAdsToArchive', undefined],
  ['lib/data.ts', 'sweepExpiredPaidAds', undefined],
  ['lib/data.ts', 'sweepExpiredArchived', undefined],
  ['lib/data.ts', 'recordView', undefined],
  ['lib/data.ts', 'promoteScheduledAds', undefined],
  ['lib/seed-areas.ts', 'ensureSaudiAreas', undefined],
  ['lib/classified.ts', 'promoteScheduledClassifieds', undefined],
  ['lib/classified.ts', 'recordClassifiedView', undefined],
  ['lib/classified.ts', 'recordClassifiedClick', undefined],
  ['lib/auth.ts', 'getSessionImpl', null],
  ['lib/redis.ts', 'createRedis', null],
];
for (const [file, name, result] of guards) {
  it(`${file}:${name} returns before dependencies only in preview`, async () => {
    const source = ts.createSourceFile(file, readFileSync(base + file, 'utf8'), ts.ScriptTarget.Latest, true);
    const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name) as ts.FunctionDeclaration;
    const statement = declaration.body!.statements[0].getText(source);
    expect(statement).toContain('isPreviewReadOnly()');
    const run = new Function('isPreviewReadOnly', `return (async () => { ${statement}; return 'production'; })()`);
    expect(await run(() => true)).toBe(result);
    expect(await run(() => false)).toBe('production');
  });
}

it('scheduled ad promotion attempts no mutation or cache invalidation in preview', async () => {
  const source = ts.createSourceFile('data.ts', readFileSync(base + 'lib/data.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'promoteScheduledAds')!;
  const js = ts.transpileModule(declaration.getText(source).replace(/^export /, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const bustAdCaches = vi.fn().mockResolvedValue(undefined);
  const make = new Function('isPreviewReadOnly', 'prisma', 'bustAdCaches', `let schedLastRun = 0; ${js}; return promoteScheduledAds;`);
  let preview = true;
  const run = make(() => preview, { ads: { updateMany } }, bustAdCaches);
  await run();
  expect(updateMany).not.toHaveBeenCalled();
  expect(bustAdCaches).not.toHaveBeenCalled();
  // The preview call must not consume the production throttle window either.
  preview = false;
  await run();
  expect(updateMany).toHaveBeenCalledTimes(1);
  expect(bustAdCaches).toHaveBeenCalledTimes(1);
});
