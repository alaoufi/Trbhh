import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
export type FinanceAuditContext={ip:string|null;sessionFingerprint:string|null};
const context=new AsyncLocalStorage<FinanceAuditContext>();
export function withFinanceAuditContext<T>(value:FinanceAuditContext,work:()=>T):T {
  return context.run({ip:value.ip?.slice(0,128)||null,sessionFingerprint:value.sessionFingerprint?.slice(0,128)||null},work);
}
export function financeAuditContext():FinanceAuditContext{return context.getStore()??{ip:null,sessionFingerprint:null};}
