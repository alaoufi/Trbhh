import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/suppliers/worker',()=>({reconcileSuppliers:vi.fn().mockResolvedValue({done:1,failed:0,synced:0,imported:0,dispatched:0,tracked:0})}));
import {reconcileSuppliers} from '@/lib/suppliers/worker';
import {POST} from '@/app/api/internal/suppliers/reconcile/route';
const secret='test-only-reconcile-secret-32-characters';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('SUPPLIER_RECONCILE_SECRET',secret);vi.stubEnv('SUPPLIER_PUBLIC_ORIGIN','https://example.com');});
describe('supplier reconciliation authorization',()=>{
 it('fails closed without configured sufficiently strong secret',async()=>{
  vi.stubEnv('SUPPLIER_RECONCILE_SECRET','');expect((await POST(new Request('https://example.com',{method:'POST'}))).status).toBe(503);expect(reconcileSuppliers).not.toHaveBeenCalled();
 });
 it.each(['','Bearer wrong','Basic abc'])('rejects invalid bearer %s before DB/network',async authorization=>{
  expect((await POST(new Request('https://example.com',{method:'POST',headers:{authorization}}))).status).toBe(401);expect(reconcileSuppliers).not.toHaveBeenCalled();
 });
 it('returns only aggregate counts without caching',async()=>{
  const response=await POST(new Request('https://example.com',{method:'POST',headers:{authorization:`Bearer ${secret}`}}));
  expect(response.status).toBe(200);expect(await response.json()).toEqual({done:1,failed:0,synced:0,imported:0,dispatched:0,tracked:0});expect(response.headers.get('cache-control')).toBe('no-store');
 });
});
