import 'server-only';
import type {CommerceDb} from '@/lib/commerce/types';
import {requireFinancePermission} from '@/lib/access-control/financial-authorization';
import {assertFinanceSchemaReady} from './schema';
import {readFinanceData,financeJson} from './read-model';
import {buildFinanceReport} from './reports';
import {auditFinance,fingerprint,parseFinanceMonth,requireOpenPeriod} from './service';

/** A review attests this exact source snapshot. It never fabricates receipts,
 * clears a source mismatch or marks a future, changed snapshot reconciled.
 */
export async function recordFinanceReconciliation(db:CommerceDb,actor:bigint,input:{month:string;reason:string;requestKey:string},now=new Date()):Promise<bigint>{
  const month=parseFinanceMonth(input.month),reason=input.reason?.trim();
  if(!reason||reason.length<3||reason.length>1000)throw new Error('finance_reason_required');
  if(!/^[\w.:-]{8,80}$/.test(input.requestKey))throw new Error('finance_request_invalid');
  await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireFinancePermission(tx,actor,'reconciliation:reconcile');
    await requireOpenPeriod(tx,month);
    const [prior]=await tx.$queryRaw<{id:bigint;month:string;reason:string}[]>`SELECT id,month,reason FROM finance_reconciliations WHERE request_key=${input.requestKey} FOR UPDATE`;
    if(prior){if(prior.month!==month||prior.reason!==reason)throw new Error('finance_idempotency_conflict');return prior.id;}
    const data=await readFinanceData(tx),report=buildFinanceReport(data,{month,section:'reconciliation',mode:'accountant'},now);
    if(!data.ready||report.issues.some(issue=>issue.severity==='error'))throw new Error('finance_reconciliation_unresolved');
    // Include monetary sources (not this audit/review record) so later changes
    // do not inherit a successful review of an older snapshot.
    const snapshot={month,reviewedAt:now.toISOString(),metrics:report.metrics,issues:report.issues,orders:data.orders,receipts:data.receipts,refunds:data.refunds,accruals:data.accruals,settlements:data.settlements,invoices:data.invoices,expenses:data.expenses};
    const hash=fingerprint(snapshot);
    await tx.$executeRaw`INSERT INTO finance_reconciliations(request_key,fingerprint,month,snapshot,reason,actor_id,created_at) VALUES(${input.requestKey},${hash},${month},${JSON.stringify(snapshot)},${reason},${actor},${now})`;
    const [saved]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_reconciliations WHERE request_key=${input.requestKey}`;
    const [previous]=await tx.$queryRaw<{id:bigint;fingerprint:string;snapshot:unknown}[]>`SELECT id,fingerprint,snapshot FROM finance_reconciliations WHERE month=${month} AND id<>${saved.id} ORDER BY id DESC LIMIT 1`;
    await auditFinance(tx,actor,'reconciliation_reviewed','reconciliation',String(saved.id),reason,{before:previous?{id:String(previous.id),fingerprint:previous.fingerprint,snapshot:financeJson(previous.snapshot)}:null,after:{id:String(saved.id),fingerprint:hash,snapshot}},now);
    return saved.id;
  },{isolationLevel:'RepeatableRead',maxWait:10000,timeout:30000});
}
