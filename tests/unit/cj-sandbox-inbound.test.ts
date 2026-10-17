import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {describe,it,expect,vi} from 'vitest';
const source=readFileSync('scripts/diagnostics/cj-sandbox-inbound.cjs','utf8');
async function run({callbacks=true,previous=true,duplicate=false,mismatch=false,mode='--confirm-created',status='UNPAID'}={}){
 const logs:string[]=[],calls:string[]=[],mkdir=vi.fn((path:string)=>{calls.push(path);if(duplicate)throw Object.assign(Error('exists'),{code:'EEXIST'});});
 const db={$disconnect:vi.fn(),$queryRawUnsafe:vi.fn(async(sql:string)=>{
  if(sql.includes('FROM cj_auth'))return [{}];if(sql.includes('MAX(id)'))return [{id:10n}];
  if(sql.includes('FROM cj_webhook_events'))return [{id:11n,type:'ORDER',raw_status:'UNSHIPPED',track_number:'TRBHH-SANDBOX-TEST-001',processed:1,received_at:'test'}];return [];
 })};
 const prepare=vi.fn(async({claimOnce}:{claimOnce:()=>void})=>{calls.push('prepare');claimOnce();return {orderId:'id',cjOrderCode:'SD123456'};});
 const financial=vi.fn(async({claimOnce,report}:{claimOnce:()=>void;report:(r:unknown)=>void})=>{calls.push('financial');report({event:'CJ_SANDBOX_IDENTIFIED',orderId:mismatch?'other':mode==='--continue-unpaid'?'261071053280661800':'id',cjOrderCode:mode==='--continue-unpaid'?'SD261071053270664700':'SD123456',status});claimOnce();return {event:'CJ_SANDBOX_PAYMENT_TRACKING_VERIFIED'};});
 const receiver=vi.fn(async()=>{calls.push('receiver');});
 const realRequire=createRequire(import.meta.url);
 const sandbox={__dirname:'/diagnostics',require:(name:string)=>{
  if(name==='fs')return {existsSync:()=>true,mkdirSync:mkdir,lstatSync:()=>({isDirectory:()=>previous,isSymbolicLink:()=>false})};
  if(name==='@prisma/client')return {PrismaClient:class{constructor(){return db;}}};
  if(name.endsWith('/cj-catalog-audit.cjs'))return {decryptToken:()=> 'private-token'};
  if(name.endsWith('/cj-sandbox-confirm.cjs'))return {confirmationTransport:()=> 'confirm-api',prepareSandboxPayment:prepare};
  if(name.endsWith('/cj-sandbox-financial.cjs'))return {financialTransport:()=> 'financial-api',sandboxFinancialProbe:financial};
  if(name.endsWith('/cj-webhook-setup.cjs'))return {setupApi:vi.fn(async()=>({openId:'123456'})),verifyRegistration:()=>callbacks,verifyReceiver:receiver};
  return realRequire(name);
 },process:{argv:['node','script',mode],env:{},exitCode:0},console:{log:(s:string)=>logs.push(s)},setTimeout:(fn:()=>void)=>fn()};
 await runInNewContext(source,sandbox);
 return {logs,calls,mkdir,prepare,financial,receiver,db};
}
describe('same Sandbox inbound continuation orchestration',()=>{
 it('continues the observed unpaid order without replaying its cart or confirmation',async()=>{const r=await run({mode:'--continue-unpaid'});expect(r.prepare).not.toHaveBeenCalled();expect(r.financial).toHaveBeenCalledOnce();expect(r.mkdir.mock.calls.flat()).toEqual(['/app/storage/cj-sandbox-confirmed-financial-once-34b1f44e']);expect(r.logs.join('')).toContain('"cjSimulationVerified":true');});
 it.each([{mismatch:true},{status:'CREATED'},{previous:false}])('blocks unpaid continuation before claiming payment when independent evidence fails %j',async options=>{const r=await run({mode:'--continue-unpaid',...options});expect(r.prepare).not.toHaveBeenCalled();expect(r.mkdir).not.toHaveBeenCalled();expect(r.logs.join('')).toContain('"cjSimulationVerified":false');});
 it('binds the financial probe to the exact confirmed identity before taking its payment claim',async()=>{const r=await run({mismatch:true});expect(r.mkdir.mock.calls.flat()).toEqual(['/app/storage/cj-sandbox-confirm-created-once-34b1f44e']);expect(r.logs.join('')).toContain('sandbox_confirmation_identity_changed');expect(r.logs.join('')).toContain('"cjSimulationVerified":false');});
 it('verifies subscriptions first, confirms before payment, and uses distinct persistent claims',async()=>{
  const r=await run();expect(r.calls.indexOf('receiver')).toBeLessThan(r.calls.indexOf('prepare'));expect(r.calls.indexOf('prepare')).toBeLessThan(r.calls.indexOf('financial'));
  expect(r.mkdir.mock.calls.flat()).toEqual(['/app/storage/cj-sandbox-confirm-created-once-34b1f44e','/app/storage/cj-sandbox-confirmed-financial-once-34b1f44e']);
  const result=r.logs.map(v=>JSON.parse(v)).find(v=>v.event==='TRBHH_INBOUND_RESULT');expect(result).toMatchObject({cjSimulationVerified:true,paidStatusReceived:true,trackingReceived:true,customerOrderUpdated:false,realPaymentAttempted:false});expect(r.logs.join('')).not.toContain('private-token');expect(r.db.$disconnect).toHaveBeenCalledOnce();
 });
 it('does not confirm or pay when subscriptions fail independent readback',async()=>{const r=await run({callbacks:false});expect(r.prepare).not.toHaveBeenCalled();expect(r.financial).not.toHaveBeenCalled();expect(r.mkdir).not.toHaveBeenCalled();});
 it.each([{previous:false},{duplicate:true}])('cannot bypass a missing previous claim or replay a claimed continuation %j',async opts=>{const r=await run(opts);expect(r.financial).not.toHaveBeenCalled();expect(r.logs.join('')).toContain('"cjSimulationVerified":false');});
});
