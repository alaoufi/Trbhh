import 'server-only';
import { getUserPermKeys, requireAction } from '@/lib/roles';
export type FinanceAction = 'view'|'edit'|'approve'|'close'|'export';
export function financePermissionsFromKeys(keys:ReadonlySet<string>):Record<FinanceAction,boolean> {
  return {view:keys.has('finance:view'),edit:keys.has('finance:edit'),approve:keys.has('finance:approve'),close:keys.has('finance:close'),export:keys.has('finance:export')};
}
export async function getFinancePermissions(userId:number) {return financePermissionsFromKeys(await getUserPermKeys(userId));}
export async function requireFinance(action:FinanceAction) {
  await requireAction('finance','view');
  return requireAction('finance',action);
}
