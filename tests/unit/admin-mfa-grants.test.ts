import {describe,expect,it,vi} from 'vitest';
const write=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/prisma',()=>({prisma:{$transaction:write}}));
import {setUserPerms,applyRolePreset,setRolePermKeys} from '@/lib/roles';
describe('retired legacy grant paths',()=>{
  it.each([()=>setUserPerms(8,['users:view']),()=>setUserPerms(8,[]),()=>applyRolePreset(8,'manager'),()=>setRolePermKeys('manager',['finance:approve'])])('cannot bypass audited multi-role grants or MFA through a legacy writer',async run=>{
    await expect(run()).rejects.toThrow('rbac_legacy_grants_disabled');
    expect(write).not.toHaveBeenCalled();
  });
});
