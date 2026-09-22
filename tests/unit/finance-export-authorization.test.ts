import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({permission:vi.fn(),execute:vi.fn()}));
vi.mock('@/lib/access-control/financial-authorization',()=>({requireFinancePermission:mocks.permission,enforceFinanceChecker:vi.fn()}));
vi.mock('@/lib/finance/schema',()=>({assertFinanceSchemaReady:async()=>{}}));
import {recordFinanceExport} from '@/lib/finance/service';
const tx={$executeRaw:mocks.execute};
const db={$transaction:async(fn:(value:typeof tx)=>unknown)=>fn(tx)};
beforeEach(()=>{vi.clearAllMocks();mocks.permission.mockResolvedValue(undefined);mocks.execute.mockResolvedValue(1);});
describe('export audit repeats the exact capability inside its transaction',()=>{
  it('an individual invoice print uses invoices export rather than an unknown section',async()=>{
    await recordFinanceExport(db as never,3n,'2026-08','print','invoice:91');
    expect(mocks.permission).toHaveBeenCalledWith(tx,3n,'invoices:export');expect(mocks.execute).toHaveBeenCalledOnce();
  });
  it('returns and tax require their own export grant',async()=>{
    await recordFinanceExport(db as never,3n,'2026-08','xlsx','returns');expect(mocks.permission).toHaveBeenLastCalledWith(tx,3n,'returns:export');
    await recordFinanceExport(db as never,3n,'2026-08','xlsx','tax');expect(mocks.permission).toHaveBeenLastCalledWith(tx,3n,'tax:export');
  });
  it('refuses malformed invoice or unknown sections before storing an audit entry',async()=>{
    for(const section of ['invoice:0','invoice:abc','invoice:91:extra','__proto__','unknown'])await expect(recordFinanceExport(db as never,3n,'2026-08','print',section)).rejects.toThrow('access_forbidden');
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('a revoked export grant never records a successful download',async()=>{
    mocks.permission.mockRejectedValue(new Error('access_forbidden'));
    await expect(recordFinanceExport(db as never,3n,'2026-08','print','invoice:91')).rejects.toThrow('access_forbidden');expect(mocks.execute).not.toHaveBeenCalled();
  });
});
