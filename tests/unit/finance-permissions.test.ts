import {expect,it,vi} from 'vitest';
vi.mock('@/lib/access-control/guards',()=>({requireAccess:vi.fn(),readActorAccess:vi.fn()}));
import {financePermissionsFromKeys} from '@/lib/finance/permissions';
it('supplier edit and commerce edit do not authorize financial operations',()=>{
  expect(financePermissionsFromKeys(new Set(['suppliers:edit','products:edit']), 'settlements')).toMatchObject({view:false,edit:false,approve:false,close:false,export:false,refund:false,visibleSections:[]});
});
it('budget editing never authorizes settlement approval, refunds or exports',()=>{
  expect(financePermissionsFromKeys(new Set(['budget:view','budget:edit']), 'budget')).toMatchObject({view:true,edit:true,approve:false,close:false,export:false,refund:false,visibleSections:['budget']});
});
it('settlement approval does not authorize reversals or another financial module',()=>{
  const keys=new Set(['settlements:view','settlements:approve']);
  expect(financePermissionsFromKeys(keys,'settlements')).toMatchObject({view:true,edit:false,approve:true,refund:false,export:false});
  expect(financePermissionsFromKeys(keys,'invoices')).toMatchObject({view:false,edit:false,approve:false,refund:false});
});
it('a mutation or export grant without its module view never shows the control',()=>{
  expect(financePermissionsFromKeys(new Set(['settlements:approve','settlements:refund','settlements:export']), 'settlements')).toMatchObject({view:false,approve:false,refund:false,export:false});
});

it('returns creation, approval, cancellation and export remain independent grants',()=>{
 const keys=new Set(['returns:view','returns:create']);
 expect(financePermissionsFromKeys(keys,'returns')).toMatchObject({view:true,edit:true,approve:false,cancel:false,export:false,refund:false});
 expect(financePermissionsFromKeys(new Set(['returns:approve','returns:delete']),'returns')).toMatchObject({view:false,approve:false,cancel:false});
});
it('tax settings and period reopening never imply approval or invoice deletion',()=>{
 const keys=new Set(['tax:view','tax:manage_settings','periods:view','periods:reopen_period']);
 expect(financePermissionsFromKeys(keys,'tax')).toMatchObject({manageTax:true,approve:false,export:false});
 expect(financePermissionsFromKeys(keys,'close')).toMatchObject({reopen:true,close:false,approve:false});
 expect(financePermissionsFromKeys(keys,'invoices')).toMatchObject({view:false,cancel:false});
});
it('reconciliation control requires its dedicated grant and view',()=>{
 expect(financePermissionsFromKeys(new Set(['reconciliation:view','reconciliation:reconcile']),'reconciliation').reconcile).toBe(true);
 expect(financePermissionsFromKeys(new Set(['reconciliation:reconcile']),'reconciliation').reconcile).toBe(false);
});

it('accrual preparation on the supplier view uses the settlement create grant',()=>{expect(financePermissionsFromKeys(new Set(['settlements:view','settlements:create']),'suppliers').edit).toBe(true);});
