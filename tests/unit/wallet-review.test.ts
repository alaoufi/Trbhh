import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('server-only',()=>({}));
const mock=vi.hoisted(()=>({access:vi.fn(),permission:vi.fn(),schema:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/access-control/financial-authorization',()=>({requireFinancePermission:mock.permission}));
vi.mock('@/lib/access-control/store',()=>({readAccess:mock.access}));
vi.mock('@/lib/finance/schema',()=>({assertFinanceSchemaReady:mock.schema}));
vi.mock('@/lib/finance/service',()=>({auditFinance:mock.audit,fingerprint:(v:unknown)=>JSON.stringify(v)}));
import {readWalletReviewQueue,saveWalletReviewDecision} from '@/lib/finance/wallet-review';
import {walletSourceFingerprint,type WalletReviewSource} from '@/lib/finance/wallet-review-model';
const source:WalletReviewSource={id:'1',userId:'2',amountMinor:-11500,reason:'featured',sourceReference:'service:featured:9',at:'2026-10-01T10:00:00.000Z'};
const input=()=>({version:1 as const,sourceId:'1',sourceFingerprint:walletSourceFingerprint(source),expectedLatestDecisionId:null,requestKey:'request-123',status:'approved' as const,sourceReference:source.sourceReference,documentaryReference:'invoice-55',documentLineIdentity:'issuer:55:line:1',evidenceKind:'service_invoice' as const,classification:'standard' as const,netMinor:10000,note:'Reviewed service document'});
function db(audits:unknown[]=[],changed=false){const log:string[]=[];const query=vi.fn(async(strings:TemplateStringsArray)=>{const sql=strings.join('?');log.push(sql);if(sql.includes('LAST_INSERT_ID'))return [{id:20n}];if(sql.includes('SELECT id,action'))return audits.map(a=>({created_at:new Date('2026-10-02T00:00:00Z'),actor_id:9n,...a as object}));if(sql.includes('finance_invoices'))return [];if(sql.includes('wallet_txns'))return [{id:1n,user_id:2n,amount_minor:changed?-10000:-11500,reason:'featured',money_ref:source.sourceReference,created_at:new Date(source.at)}];throw Error(sql);});const tx={$queryRaw:query};return {log,tx,$queryRaw:query,$transaction:async(fn:(t:unknown)=>unknown)=>fn(tx)};}
beforeEach(()=>{vi.clearAllMocks();mock.access.mockResolvedValue({ready:true,keys:new Set(['tax:view','wallets:view'])});mock.permission.mockResolvedValue(undefined);mock.schema.mockResolvedValue(undefined);});
describe('wallet review persistence',()=>{
 it('requires tax and wallet visibility; save additionally requires approval',async()=>{const d=db();await readWalletReviewQueue(d as never,9n);expect(mock.permission).not.toHaveBeenCalled();expect(mock.access).toHaveBeenCalled();mock.permission.mockClear();await saveWalletReviewDecision(d as never,9n,input());expect(mock.permission.mock.calls.map(c=>c[2])).toEqual(['tax:view','wallets:view','tax:approve']);expect(mock.audit).toHaveBeenCalledTimes(1);});
 it('denies before reading protected records',async()=>{mock.permission.mockRejectedValue(Error('access_forbidden'));const d=db();await expect(saveWalletReviewDecision(d as never,9n,input())).rejects.toThrow('access_forbidden');expect(d.log).toEqual([]);});
 it('locks source before reading full proof/audit sets; no silent limits',async()=>{const d=db();await saveWalletReviewDecision(d as never,9n,input());expect(d.log[0]).toContain('FOR UPDATE');expect(d.log.findIndex(s=>s.includes('finance_audit'))).toBeGreaterThan(0);expect(d.log.some(s=>/LIMIT/i.test(s))).toBe(false);});
 it('fails stale source and stale latest id',async()=>{await expect(saveWalletReviewDecision(db([],true) as never,9n,input())).rejects.toThrow('source_changed');await expect(saveWalletReviewDecision(db() as never,9n,{...input(),expectedLatestDecisionId:'9'})).rejects.toThrow('decision_conflict');expect(mock.audit).not.toHaveBeenCalled();});
 it('returns exact request replay and rejects a conflicting replay',async()=>{const a={id:10n,action:'wallet_review_decision',entity:'wallet_txn_review',entity_id:'1',payload:{...input(),before:null,after:input(),ip:'127.0.0.1'}};expect(await saveWalletReviewDecision(db([a]) as never,9n,input())).toEqual({decisionId:'10',replayed:true,status:'approved'});await expect(saveWalletReviewDecision(db([a]) as never,9n,{...input(),netMinor:9000})).rejects.toThrow('request_conflict');expect(mock.audit).not.toHaveBeenCalled();});
 it('rejects proof identity already claimed by another source',async()=>{const other={...source,id:'3'};const a={id:10n,action:'wallet_review_decision',entity:'wallet_txn_review',entity_id:'3',payload:{...input(),sourceId:'3',requestKey:'request-other',sourceFingerprint:walletSourceFingerprint(other)}};await expect(saveWalletReviewDecision(db([a]) as never,9n,input())).rejects.toThrow('document_line_already_used');expect(mock.audit).not.toHaveBeenCalled();});
 it('rejects missing docs and requires finance schema',async()=>{await expect(saveWalletReviewDecision(db() as never,9n,{...input(),documentaryReference:''})).rejects.toThrow('documentary_reference_required');mock.schema.mockRejectedValue(Error('finance_schema_not_ready'));await expect(readWalletReviewQueue(db() as never,9n)).rejects.toThrow('finance_schema_not_ready');});
});




describe('wallet review competing actors',()=>{
 it('rechecks documentary uniqueness after the shared authorization mutex',async()=>{
  const sources=[source,{...source,id:'2',userId:'3',sourceReference:'service:featured:10'}];
  const audits:{id:bigint;action:string;entity:string;entity_id:string;payload:unknown}[]=[];
  let tail=Promise.resolve(),nextId=20n;
  const query=async(strings:TemplateStringsArray,...values:unknown[])=>{
   const sql=strings.join('?');
   if(sql.includes('LAST_INSERT_ID'))return [{id:nextId}];
   if(sql.includes('SELECT id,action'))return audits.map(a=>({created_at:new Date('2026-10-02T00:00:00Z'),actor_id:9n,...a}));
   if(sql.includes('finance_invoices'))return [];
   if(sql.includes('wallet_txns'))return sources.filter(s=>!sql.includes('FOR UPDATE')||s.id===String(values[0])).map(s=>({id:BigInt(s.id),user_id:BigInt(s.userId),amount_minor:s.amountMinor,reason:s.reason,money_ref:s.sourceReference,note:null,created_at:new Date(s.at)}));
   throw Error(sql);
  };
  const concurrentDb={$transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>{let release!:()=>void;const wait=tail;tail=new Promise<void>(r=>{release=r;});const tx={$queryRaw:query,lock:wait};try{return await fn(tx);}finally{release();}}};
  mock.permission.mockImplementation(async(tx:{lock:Promise<void>})=>{await tx.lock;});
  mock.audit.mockImplementation(async(_tx:unknown,_actor:bigint,action:string,entity:string,entityId:string,_note:string,payload:unknown)=>{audits.push({id:++nextId,action,entity,entity_id:entityId,payload});});
  const second={...input(),sourceId:'2',sourceFingerprint:walletSourceFingerprint(sources[1]),sourceReference:sources[1].sourceReference,requestKey:'request-second'};
  const outcomes=await Promise.allSettled([saveWalletReviewDecision(concurrentDb as never,9n,input()),saveWalletReviewDecision(concurrentDb as never,10n,second)]);
  expect(outcomes.map(r=>r.status)).toEqual(['fulfilled','rejected']);expect(audits).toHaveLength(1);
  expect((outcomes[1] as PromiseRejectedResult).reason.message).toContain('document_line_already_used');
 });
});

it.each([{actor_id:null},{actor_id:0n},{created_at:null},{created_at:new Date('invalid')}])('rejects actual audit records with invalid provenance',async bad=>{const a={id:10n,action:'wallet_review_decision',entity:'wallet_txn_review',entity_id:'1',payload:input(),...bad};await expect(readWalletReviewQueue(db([a]) as never,9n)).rejects.toThrow('wallet_review_audit_invalid');});
it('denies wallet queue permission without acquiring financial mutex',async()=>{mock.access.mockResolvedValue({ready:true,keys:new Set(['tax:view'])});const d=db();await expect(readWalletReviewQueue(d as never,9n)).rejects.toThrow('access_forbidden');expect(mock.permission).not.toHaveBeenCalled();expect(d.log).toEqual([]);});


it('reads currently eligible sources plus every source referenced by immutable wallet audit',async()=>{const d=db();await readWalletReviewQueue(d as never,9n);expect(d.log.find(sql=>sql.includes('FROM wallet_txns'))).toContain("OR EXISTS (SELECT 1 FROM finance_audit a WHERE a.action='wallet_review_decision'");});
