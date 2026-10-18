import 'server-only';
import type {Prisma} from '@prisma/client';
import type {CommerceDb} from '@/lib/commerce/types';
import {readAccess} from '@/lib/access-control/store';
import {requireFinancePermission} from '@/lib/access-control/financial-authorization';
import {assertFinanceSchemaReady} from './schema';
import {auditFinance,fingerprint} from './service';
import {reconcileWalletReviews,walletDecisionProblems,walletDecisionIdentity,WALLET_REVIEW_ACTION,WALLET_REVIEW_ENTITY,type WalletReviewSource,type WalletReviewAudit,type WalletReviewDecision} from './wallet-review-model';
export type {WalletReviewDecision,WalletReviewQueueRow,WalletReviewSource} from './wallet-review-model';
type Tx=Prisma.TransactionClient;
type SourceRow={id:bigint;user_id:bigint;amount_minor:unknown;reason:string;money_ref:string|null;note?:string|null;created_at:Date|null};
const options={isolationLevel:'RepeatableRead' as const,maxWait:10000,timeout:30000};
const excluded=['topup','admin_credit','bonus','verify_gift','points_convert','referral','welcome'];
function integer(v:unknown){const n=Number(String(v));if(!Number.isSafeInteger(n)||!/^-?\d+$/.test(String(v)))throw Error('wallet_review_amount_invalid');return n;}
function json(v:unknown):unknown {if(typeof v!=='string')return v;try{return JSON.parse(v);}catch{throw Error('wallet_review_audit_invalid');}}
function source(row:SourceRow):WalletReviewSource {if(!(row.created_at instanceof Date)||!Number.isFinite(row.created_at.getTime()))throw Error('wallet_review_source_invalid');return {id:String(row.id),userId:String(row.user_id),amountMinor:integer(row.amount_minor),reason:row.reason,sourceReference:row.money_ref||'',moneyRef:row.money_ref,note:row.note??null,at:row.created_at.toISOString()};}
async function authorize(tx:Tx,actorId:bigint,write=false){
 // Existing authorization helper locks access_control_state id=1, serializing every
 // wallet review writer and permission revocation until this transaction commits.
 if(write){await requireFinancePermission(tx,actorId,'tax:view');await requireFinancePermission(tx,actorId,'wallets:view');await requireFinancePermission(tx,actorId,'tax:approve');}else{if(actorId<=0n||actorId>BigInt(Number.MAX_SAFE_INTEGER))throw Error('access_forbidden');const access=await readAccess(tx,Number(actorId));if(!access.ready||!access.keys.has('tax:view')||!access.keys.has('wallets:view'))throw Error('access_forbidden');}await assertFinanceSchemaReady(tx);
}
/** Complete sets: pagination applies only after reconciliation, never to proof checks. */
export async function readWalletReviewEvidence(tx:Pick<Tx,'$queryRaw'>){
 const sources=await tx.$queryRaw<SourceRow[]>`SELECT id,user_id,COALESCE(amount_halala,amount*100) AS amount_minor,reason,money_ref,note,created_at FROM wallet_txns WHERE ((COALESCE(amount_halala,amount*100)<0 OR reason='refund') AND reason NOT IN ('topup','admin_credit','bonus','verify_gift','points_convert','referral','welcome')) OR EXISTS (SELECT 1 FROM finance_audit a WHERE a.action='wallet_review_decision' AND a.entity='wallet_txn_review' AND a.entity_id=CAST(wallet_txns.id AS CHAR)) ORDER BY id`;
 const raw=await tx.$queryRaw<{id:bigint;action:string;entity:string;entity_id:string;payload:unknown;created_at?:Date;actor_id?:bigint}[]>`SELECT id,action,entity,entity_id,payload,created_at,actor_id FROM finance_audit WHERE action='wallet_review_decision' AND entity='wallet_txn_review' ORDER BY id`;
 const invoices=await tx.$queryRaw<{source_key:string;number:string|null;status:string;source_snapshot:unknown;snapshot:unknown}[]>`SELECT source_key,number,status,source_snapshot,snapshot FROM finance_invoices ORDER BY id`;
 const invoiceSourceKeys=new Set<string>();
 function collect(v:unknown){if(Array.isArray(v)){for(const x of v)collect(x);return;}if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){if(['sourceReference','source_reference','money_ref','sourceKey','source_key','documentLineIdentity'].includes(k)&&typeof x==='string')invoiceSourceKeys.add(x);if(['walletTxnId','wallet_txn_id'].includes(k)&&typeof x==='string')invoiceSourceKeys.add('wallet:'+x);if(x&&typeof x==='object')collect(x);}}
 for(const i of invoices){invoiceSourceKeys.add(i.source_key);if(i.status==='issued'&&i.number)invoiceSourceKeys.add(i.number);collect(json(i.source_snapshot));collect(json(i.snapshot));}
 for(const a of raw){if(!(a.created_at instanceof Date)||!Number.isFinite(a.created_at.getTime())||typeof a.actor_id!=='bigint'||a.actor_id<=0n||a.actor_id>BigInt(Number.MAX_SAFE_INTEGER))throw Error('wallet_review_audit_invalid');}
 const audits:WalletReviewAudit[]=raw.map(a=>({id:String(a.id),action:a.action,entity:a.entity,entityId:a.entity_id,payload:json(a.payload),at:a.created_at?.toISOString(),actorId:a.actor_id===undefined?undefined:String(a.actor_id)}));
 return {sources:sources.map(source),audits,invoiceSourceKeys:[...invoiceSourceKeys]};
}
export async function readWalletReviewQueue(db:CommerceDb,actorId:bigint,{page=1}:{page?:number}={}){
 return db.$transaction(async tx=>{await authorize(tx,actorId);const e=await readWalletReviewEvidence(tx),result=reconcileWalletReviews(e.sources,e.audits,e.invoiceSourceKeys),total=result.rows.length,pages=Math.max(1,Math.ceil(total/30)),cur=Math.min(Number.isSafeInteger(page)&&page>0?page:1,pages);return {...result,rows:result.rows.slice((cur-1)*30,cur*30),total,page:cur,pages};},options);
}
export async function saveWalletReviewDecision(db:CommerceDb,actorId:bigint,input:WalletReviewDecision):Promise<{decisionId:string;replayed:boolean;status:WalletReviewDecision['status']}>{
 if(!input||!/^\d{1,20}$/.test(input.sourceId)||BigInt(input.sourceId)<=0n)throw Error('wallet_review_source_invalid');
 return db.$transaction(async tx=>{
  await authorize(tx,actorId,true);
  const locked=await tx.$queryRaw<SourceRow[]>`SELECT id,user_id,COALESCE(amount_halala,amount*100) AS amount_minor,reason,money_ref,note,created_at FROM wallet_txns WHERE id=${BigInt(input.sourceId)} FOR UPDATE`;
  if(locked.length!==1)throw Error('wallet_review_source_invalid');const s=source(locked[0]);if(excluded.includes(s.reason)||s.amountMinor>=0&&s.reason!=='refund')throw Error('wallet_review_source_invalid');
  const e=await readWalletReviewEvidence(tx),current=e.sources.find(r=>r.id===s.id);if(!current||fingerprint(current)!==fingerprint(s))throw Error('wallet_review_source_changed');
  const problems=walletDecisionProblems(s,input);if(problems.includes('source_changed'))throw Error('wallet_review_source_changed');if(problems.length)throw Error('wallet_review_'+problems[0]);
  const replay=e.audits.filter(a=>(a.payload as WalletReviewDecision)?.requestKey===input.requestKey);
  if(replay.length){if(replay.length!==1||replay[0].entityId!==input.sourceId||fingerprint(walletDecisionIdentity(replay[0].payload))!==fingerprint(walletDecisionIdentity(input)))throw Error('wallet_review_request_conflict');return {decisionId:replay[0].id,replayed:true,status:input.status};}
  if(problems.length)throw Error('wallet_review_'+problems[0]);
  const before=reconcileWalletReviews(e.sources,e.audits,e.invoiceSourceKeys).rows.find(r=>r.id===s.id)!;
  if(before.latestDecisionId!==input.expectedLatestDecisionId)throw Error('wallet_review_decision_conflict');
  // Invalid prior evidence cannot be silently overwritten into an approved event.
  const candidate:WalletReviewAudit={id:(e.audits.reduce((n,a)=>BigInt(a.id)>n?BigInt(a.id):n,0n)+1n).toString(),action:WALLET_REVIEW_ACTION,entity:WALLET_REVIEW_ENTITY,entityId:s.id,payload:input};
  const after=reconcileWalletReviews(e.sources,[...e.audits,candidate],e.invoiceSourceKeys).rows.find(r=>r.id===s.id)!;
  if(input.status==='approved'&&after.status!=='approved')throw Error('wallet_review_'+(after.missingEvidence[0]||'evidence_conflict'));
  await auditFinance(tx,actorId,WALLET_REVIEW_ACTION,WALLET_REVIEW_ENTITY,s.id,input.note,input);
  const saved=await tx.$queryRaw<{id:bigint}[]>`SELECT LAST_INSERT_ID() AS id`;if(saved.length!==1||saved[0].id<=0n)throw Error('wallet_review_audit_invalid');
  return {decisionId:String(saved[0].id),replayed:false,status:input.status};
 },options);
}
