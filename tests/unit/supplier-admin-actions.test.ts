import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ gate: vi.fn(), schema: vi.fn(), transaction: vi.fn(), query: vi.fn(), execute: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/commerce/schema', () => ({ assertCommerceSchemaReady: state.schema }));
vi.mock('@/lib/roles', () => ({ requireAction: state.gate }));
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: state.transaction } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
import { deleteSupplier, deleteSupplierProducts, saveStoreCoordinator, saveSupplier, saveSupplierProduct } from '@/app/admin/suppliers/actions';

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
describe('supplier administration boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.gate.mockResolvedValue({ uid: 9 });
    state.execute.mockResolvedValue(1);
    state.query.mockResolvedValue([{ id: 41n }]);
    state.transaction.mockImplementation(async work => work({ $queryRaw: state.query, $executeRaw: state.execute, admin_log: { create: state.audit } }));
  });
  it.each([saveSupplier, saveSupplierProduct])('blocks unauthorized mutations before DB work', async action => {
    state.gate.mockRejectedValueOnce(new Error('forbidden'));
    await expect(action(new FormData())).rejects.toThrow('forbidden');
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it('uses suppliers add/edit independently of commerce permissions', async () => {
    await expect(saveSupplier(form({ name: 'Fixture' }))).rejects.toThrow('redirect:');
    expect(state.gate).toHaveBeenLastCalledWith('suppliers', 'add');
    state.query.mockResolvedValueOnce([{ id: 2n }]);
    await expect(saveSupplier(form({ id: '2', name: 'Fixture' }))).rejects.toThrow('redirect:');
    expect(state.gate).toHaveBeenLastCalledWith('suppliers', 'edit');
  });
  it('rejects malformed supplier IDs before a transaction', async () => {
    await expect(saveSupplier(form({ id: '1 OR 1=1', name: 'Fixture' }))).rejects.toThrow('error=');
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it('refuses API activation without any DB write', async () => {
    await expect(saveSupplier(form({ name: 'Fixture', apiEnabled: '1' }))).rejects.toThrow('error=');
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it('creates inactive supplier profiles and audits without endpoint or secret reference', async () => {
    await expect(saveSupplier(form({ name: 'Fixture', apiBaseUrl: 'https://supplier.example/api', apiCredentialRef: 'TRBHH_SUPPLIER_FIXTURE' }))).rejects.toThrow('saved=1');
    const call = state.execute.mock.calls[0];
    expect(call[0].join('?')).toContain('INSERT INTO commerce_suppliers');
    expect(call.slice(1)).toContain('TRBHH_SUPPLIER_FIXTURE');
    expect(call[0].join('?')).toMatch(/api_enabled/);
    expect(JSON.stringify(state.audit.mock.calls, (_, value) => typeof value === 'bigint' ? value.toString() : value)).not.toMatch(/supplier\.example|TRBHH_SUPPLIER_FIXTURE/);
    expect(state.audit).toHaveBeenCalledOnce();
    expect(state.audit.mock.calls[0][0].data.target).toBe('41');
  });
  it('locks product before supplier, then maps and audits atomically', async () => {
    state.query.mockResolvedValueOnce([{ id: 12n, approved: 1 }]).mockResolvedValueOnce([{ id: 2n, active: 1 }]);
    await expect(saveSupplierProduct(form({ productId: '12', supplierId: '2', supplierSku: 'SKU1', unitCost: '10.25' }))).rejects.toThrow('saved=1');
    expect(state.gate).toHaveBeenCalledWith('suppliers', 'edit');
    expect(state.query.mock.calls[0][0].join('?')).toMatch(/commerce_products.*FOR UPDATE/);
    expect(state.query.mock.calls[1][0].join('?')).toMatch(/commerce_suppliers.*FOR UPDATE/);
    expect(state.transaction).toHaveBeenCalledOnce();
    expect(state.execute.mock.calls[0].slice(1)).toContain(1025);
    expect(state.audit).toHaveBeenCalledOnce();
  });
  it.each([{ suppliers: [] }, { suppliers: [{ id: 2n, active: 0 }] }])('rejects missing/inactive supplier without mapping or audit', async ({ suppliers }) => {
    state.query.mockResolvedValueOnce([{ id: 12n, approved: 1 }]).mockResolvedValueOnce(suppliers);
    await expect(saveSupplierProduct(form({ productId: '12', supplierId: '2', supplierSku: 'SKU1', unitCost: '10.25' }))).rejects.toThrow('error=');
    expect(state.execute).not.toHaveBeenCalled(); expect(state.audit).not.toHaveBeenCalled();
  });
  it('rejects an unapproved product before locking supplier', async () => {
    state.query.mockResolvedValueOnce([{ id: 12n, approved: 0 }]);
    await expect(saveSupplierProduct(form({ productId: '12', supplierId: '2', supplierSku: 'SKU1', unitCost: '10.25' }))).rejects.toThrow('error=');
    expect(state.query).toHaveBeenCalledOnce(); expect(state.execute).not.toHaveBeenCalled();
  });
  it('fails closed on partial schema without revealing raw errors', async () => {
    state.schema.mockRejectedValueOnce(new Error('private DB details'));
    await expect(saveSupplier(form({ name: 'Fixture' }))).rejects.toThrow('redirect:/admin/suppliers?error=save');
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it('saves or clears the optional coordinator without changing supplier or OAuth contact data', async()=>{
    state.query.mockResolvedValueOnce([{id:2n}]);
    await expect(saveStoreCoordinator(form({coordinatorSupplierId:'2',storeCoordinatorPhone:'0500000000'}))).rejects.toThrow('coordinator=1');
    expect(state.gate).toHaveBeenCalledWith('suppliers','edit');
    expect(state.execute.mock.calls[0][0].join('?')).toMatch(/^UPDATE commerce_suppliers SET store_coordinator_phone=/);
    expect(state.execute.mock.calls[0].slice(1)).toContain('+966500000000');
    expect(state.execute.mock.calls[0][0].join('?')).not.toMatch(/supplier_connections|oauth|\bphone=/);
    expect(JSON.stringify(state.audit.mock.calls,(_,v)=>typeof v==='bigint'?v.toString():v)).not.toContain('+966500000000');
  });
  it('requires the supplier delete permission and exact two-step confirmations', async () => {
    await expect(deleteSupplierProducts(form({supplierId:'2',supplierName:'Fixture',confirmName:'Fixture',confirmPhrase:'حذف منتجات المورد',acknowledge:'1'}))).rejects.toThrow('redirect:');
    expect(state.gate).toHaveBeenLastCalledWith('suppliers','delete');
    expect(state.transaction).toHaveBeenCalledOnce();
    vi.clearAllMocks();state.gate.mockResolvedValue({uid:9});state.query.mockResolvedValue([{id:2n,name:'Fixture'}]);
    await expect(deleteSupplier(form({supplierId:'2',supplierName:'Fixture',confirmName:'Wrong',confirmPhrase:'حذف المورد نهائياً',acknowledge:'1'}))).rejects.toThrow('error=delete_confirmation');
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it('blocks supplier deletion until imported products are removed', async () => {
    state.query.mockResolvedValueOnce([{id:2n,name:'Fixture'}]).mockResolvedValueOnce([{product_count:1n,history_count:0n}]);
    await expect(deleteSupplier(form({supplierId:'2',supplierName:'Fixture',confirmName:'Fixture',confirmPhrase:'حذف المورد نهائياً',acknowledge:'1'}))).rejects.toThrow('error=delete_products_first');
    expect(state.execute).not.toHaveBeenCalled();
  });
});
