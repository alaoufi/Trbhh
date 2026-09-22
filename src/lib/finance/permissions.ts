import 'server-only';
import { FINANCE_SECTION_MODULE, type AccessAction } from '@/lib/access-control/catalog';
import { readActorAccess, requireAccess } from '@/lib/access-control/guards';
import type { FinanceSection } from './types';
export function financePermissionsFromKeys(keys:ReadonlySet<string>, section:FinanceSection='overview') {
  const accessModule=FINANCE_SECTION_MODULE[section], view=keys.has(accessModule+':view');
  const can=(action:string)=>view&&keys.has(accessModule+':'+action);
  return {view,edit:can(section==='settlements'||section==='expenses'||section==='invoices'?'create':'edit'),approve:can('approve'),refund:can('refund'),close:can('close_period'),export:can('export'),
    visibleSections:Object.entries(FINANCE_SECTION_MODULE).filter(([,value])=>keys.has(value+':view')).map(([key])=>key as FinanceSection),
    viewFinance:keys.has('finance:view'),viewSettlements:keys.has('settlements:view'),viewInvoices:keys.has('invoices:view'),viewReconciliation:keys.has('reconciliation:view'),viewAudit:keys.has('audit:view')};
}
export async function getFinancePermissions(userId:number,section:FinanceSection='overview') {return financePermissionsFromKeys((await readActorAccess(userId)).keys,section);}
export async function requireFinance(section:FinanceSection,action:AccessAction='view') {
  const accessModule=FINANCE_SECTION_MODULE[section];
  await requireAccess(accessModule,'view');
  return requireAccess(accessModule,action);
}
