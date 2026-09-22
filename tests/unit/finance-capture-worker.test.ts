import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({schema:vi.fn(),read:vi.fn(),gate:vi.fn(),transaction:vi.fn(),query:vi.fn(),execute:vi.fn()}));
vi.mock('@/lib/finance/schema',()=>({assertFinanceSchemaReady:state.schema}));
vi.mock('@/lib/finance/read-model',()=>({readFinanceData:state.read,financeNumber:Number,financeJson:(value:unknown)=>value}));
vi.mock('@/lib/access-control/financial-authorization',()=>({requireFinancePermission:state.gate,enforceFinanceChecker:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{$transaction:state.transaction}}));
import {captureInvoices,captureInvoicesForWorker} from '@/lib/finance/service';
import {POST} from '@/app/api/internal/finance/capture/route';
const credential='synthetic-worker-credential-32-characters-only';
const db={$transaction:state.transaction};
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('FINANCE_CAPTURE_SECRET',credential);
 state.schema.mockResolvedValue(undefined);state.execute.mockResolvedValue(1);
 state.gate.mockImplementation(async(_tx,actor:bigint)=>{if(actor===0n)throw Error('access_forbidden');});
 state.transaction.mockImplementation(async(fn:(tx:unknown)=>unknown)=>fn({$queryRaw:state.query,$executeRaw:state.execute}));
 state.query.mockImplementation(async(sql:TemplateStringsArray)=>{
  const text=sql.join('?');if(text.includes('FROM finance_periods'))return [{closed_at:null,version:0,checks_json:[],reason:''}];
  if(text.includes('FROM finance_invoices'))return text.includes('FOR UPDATE')?[]:[{id:7n}];throw Error('Unexpected worker query');
 });
 state.read.mockResolvedValue({orders:[{id:'1',status:'paid',totalMinor:11500,currency:'SAR'}],receipts:[{id:'2',orderId:'1',amountMinor:11500,currency:'SAR',at:'2026-09-22T12:00:00Z'}],invoices:[]});
});
afterEach(()=>vi.unstubAllEnvs());
const noDatabase=()=>{expect(state.schema).not.toHaveBeenCalled();expect(state.read).not.toHaveBeenCalled();expect(state.transaction).not.toHaveBeenCalled();};
describe('narrow authenticated finance capture worker',()=>{
 it.each(['','wrong','Bearer wrong','Basic '+credential,'Bearer '+credential+'x','Bearer '+'x'.repeat(1025)])('rejects invalid authorization before any database access',async authorization=>{
  await expect(captureInvoicesForWorker(db as never,authorization)).rejects.toThrow('finance_capture_unauthorized');noDatabase();
 });
 it.each(['','short'])('fails closed with an absent or short configured key',async secret=>{
  vi.stubEnv('FINANCE_CAPTURE_SECRET',secret);
  await expect(captureInvoicesForWorker(db as never,'Bearer '+credential)).rejects.toThrow('finance_capture_not_configured');noDatabase();
 });
 it('allows only pending source capture for an authenticated worker, auditing system actor zero',async()=>{
  await expect(captureInvoicesForWorker(db as never,'Bearer '+credential)).resolves.toBe(1);
  expect(state.gate).not.toHaveBeenCalled();
  const queries=state.execute.mock.calls.map(call=>(call[0] as TemplateStringsArray).join('?'));
  expect(queries).toHaveLength(3);
  expect(queries.every(query=>query.startsWith('INSERT INTO finance_periods')||query.startsWith('INSERT INTO finance_invoices')||query.startsWith('INSERT INTO finance_audit'))).toBe(true);
  expect(queries.find(query=>query.startsWith('INSERT INTO finance_invoices'))).not.toMatch(/\b(issued_at|snapshot|number|net_minor|vat_minor)\b/);
  const audit=state.execute.mock.calls.find(call=>(call[0] as TemplateStringsArray).join('?').includes('finance_audit'))!;
  expect(audit[2]).toBe(0n);expect(JSON.stringify(audit.slice(3))).not.toContain(credential);
 });
 it('never converts manual actor zero into a worker authority',async()=>{
  await expect(captureInvoices(db as never,0n)).rejects.toThrow('access_forbidden');noDatabase();
 });
 it('keeps employee capture permission checks at entry and before each write',async()=>{
  await expect(captureInvoices(db as never,71n)).resolves.toBe(1);
  expect(state.gate).toHaveBeenCalledTimes(2);
  for(const call of state.gate.mock.calls)expect(call.slice(1)).toEqual([71n,'invoices:create']);
 });
 it('preserves worker HTTP statuses and never reaches the database on rejected credentials',async()=>{
  expect((await POST(new Request('https://app.test/api/internal/finance/capture',{method:'POST'}))).status).toBe(401);noDatabase();
  vi.stubEnv('FINANCE_CAPTURE_SECRET','');expect((await POST(new Request('https://app.test/api/internal/finance/capture',{method:'POST'}))).status).toBe(503);noDatabase();
 });
 it('worker route delegates the authorization string and returns the captured count',async()=>{
  const response=await POST(new Request('https://app.test/api/internal/finance/capture',{method:'POST',headers:{authorization:'Bearer '+credential,'x-forwarded-for':'127.0.0.1'}}));
  expect(response.status).toBe(200);expect(await response.json()).toEqual({captured:1});
  const audit=state.execute.mock.calls.find(call=>(call[0] as TemplateStringsArray).join('?').includes('finance_audit'))!;
  const payload=JSON.parse(audit.at(-1));expect(payload).toMatchObject({ip:'127.0.0.1',sessionFingerprint:null});expect(JSON.stringify(payload)).not.toContain(credential);
 });
});
