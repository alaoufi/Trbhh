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
