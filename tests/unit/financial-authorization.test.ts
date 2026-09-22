import {beforeEach,describe,it,expect,vi} from 'vitest';
import type {Prisma} from '@prisma/client';
const mock=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/lib/access-control/store',()=>({readAccess:mock.read}));
import {requireFinancePermission,enforceFinanceChecker} from '@/lib/access-control/financial-authorization';
const query=vi.fn(),unsafe=vi.fn();
const tx={$queryRaw:query,$queryRawUnsafe:unsafe} as unknown as Prisma.TransactionClient;
beforeEach(()=>{vi.clearAllMocks();query.mockResolvedValue([{initialized_at:new Date()}]);unsafe.mockResolvedValue([{n:1n}]);mock.read.mockResolvedValue({ready:true,keys:new Set(['settlements:view','settlements:approve'])});});
describe('transactional financial authorization',()=>{
  it('denies unknown keys without touching the database',async()=>{await expect(requireFinancePermission(tx,1n,'settlements:unknown')).rejects.toThrow('access_forbidden');expect(query).not.toHaveBeenCalled();});
  it('denies absent initialization and never reads grants',async()=>{query.mockResolvedValue([]);await expect(requireFinancePermission(tx,1n,'settlements:approve')).rejects.toThrow('access_forbidden');expect(mock.read).not.toHaveBeenCalled();});
  it('requires view as well as the independent action',async()=>{mock.read.mockResolvedValue({ready:true,keys:new Set(['settlements:approve'])});await expect(requireFinancePermission(tx,1n,'settlements:approve')).rejects.toThrow('access_forbidden');});
  it('does not accept a stale earlier grant or inactive user',async()=>{mock.read.mockResolvedValue({ready:false,keys:new Set(['settlements:view','settlements:approve'])});await expect(requireFinancePermission(tx,1n,'settlements:approve')).rejects.toThrow('access_forbidden');});
  it('refuses self approval when an eligible second checker exists',async()=>{await expect(enforceFinanceChecker(tx,1n,1n,'settlements:approve')).rejects.toThrow('finance_independent_checker_required');});
  it('allows an independent checker with fresh permissions',async()=>{expect(await enforceFinanceChecker(tx,2n,1n,'settlements:approve')).toEqual({mode:'independent_checker',makerId:'1',checkerId:'2'});});
  it('records the sole eligible approver exception explicitly',async()=>{unsafe.mockResolvedValue([{n:0n}]);expect(await enforceFinanceChecker(tx,1n,1n,'settlements:approve')).toEqual({mode:'sole_approver',makerId:'1',checkerId:'1'});});
  it('refuses missing or unrepresentable actor IDs',async()=>{for(const actor of [0n,-1n,9007199254740992n])await expect(requireFinancePermission(tx,actor,'settlements:approve')).rejects.toThrow('access_forbidden');});
});
