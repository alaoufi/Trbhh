import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the actual action with isolated dependencies; never import the monolith's external providers.
function loadAction(prisma: unknown, requireAccess: unknown, name: string) {
  const source = ts.createSourceFile('actions.ts', readFileSync('src/app/admin/actions.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const node = source.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  if (!node) throw new Error('Missing action');
  const code = ts.transpileModule(node.getText(source).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('prisma', 'requireAccess', 'bustAdCaches', 'revalidatePath', 'toInt', 'addStoreWarning', 'logAdmin', `${code}; return ${name};`)(prisma, requireAccess, async () => {}, () => {}, Number, async () => {}, async () => {}) as (form: FormData) => Promise<void>;
}

describe.each(['adminToggleAdStatusAction', 'adminArchiveAdAction', 'adminHideStoreAdAction'])('%s publication and archive boundary', name => {
  it.each([
    { status: 0, key: 'archive', allowed: false },
    { status: 1, key: 'approve', allowed: false },
    { status: 0, key: 'approve', allowed: true },
    { status: 1, key: 'archive', allowed: true },
  ])('status $status with ads:$key has allowed=$allowed', async ({ status, key, allowed }) => {
    let locked = false;
    const update = vi.fn(async () => { expect(locked).toBe(true); });
    const read = vi.fn(async () => [{ status }]);
    const tx = { $queryRawUnsafe: vi.fn(async (...args: unknown[]) => { expect(args[0]).toMatch(/FOR UPDATE/); locked = true; return read(); }), ads: { update }, store_products: { findFirst: async () => ({ store_id: 5 }) } };
    const gate = vi.fn(async (module: string, permission: string) => {
      if (module === 'stores' && permission === 'suspend') return { uid: 7 };
      expect(module).toBe('ads');
      if (permission !== 'view') { expect(locked).toBe(true); if (permission !== key) throw new Error('DENIED'); }
      return { uid: 7 };
    });
    const prisma = { $transaction: async (fn: (db: typeof tx) => Promise<void>) => fn(tx), ads: { findUnique: async () => ({ status }), update } };
    const form = new FormData(); form.set('adId', '42'); form.set('status', String(1 - status));
    form.set('storeId', '5');
    const run = loadAction(prisma, gate, name)(form);
    if (allowed) {
      await run;
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42n }, data: expect.objectContaining({ status: 1 - status }) }));
    } else { await expect(run).rejects.toThrow('DENIED'); expect(update).not.toHaveBeenCalled(); }
    expect(gate).toHaveBeenCalledWith('ads', status === 1 ? 'archive' : 'approve');
  });
});
