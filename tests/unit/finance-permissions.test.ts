import {expect,it} from 'vitest';
import {financePermissionsFromKeys} from '@/lib/finance/permissions';
it('supplier edit and commerce edit do not authorize financial operations',()=>{
  expect(financePermissionsFromKeys(new Set(['suppliers:edit','commerce:edit']))).toEqual({view:false,edit:false,approve:false,close:false,export:false});
});
it('separates financial viewing, recording, approval, closing and export',()=>{
  expect(financePermissionsFromKeys(new Set(['finance:view','finance:edit']))).toEqual({view:true,edit:true,approve:false,close:false,export:false});
});
