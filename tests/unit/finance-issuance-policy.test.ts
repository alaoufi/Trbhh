import {beforeEach,describe,expect,it,vi} from 'vitest';
const boundary=vi.hoisted(()=>({schema:vi.fn(),permission:vi.fn()}));
vi.mock('@/lib/finance/schema',()=>({assertFinanceSchemaReady:boundary.schema}));
vi.mock('@/lib/access-control/financial-authorization',()=>({requireFinancePermission:boundary.permission,enforceFinanceChecker:vi.fn()}));
import {issueInvoice} from '@/lib/finance/service';
import {calculateFiscalLines} from '@/lib/finance/calculations';
import type {FiscalSnapshot} from '@/lib/finance/types';

const saleAt=new Date('2026-08-31T22:00:00Z'); // September 1 in Riyadh.
const issuedAt=new Date('2026-10-15T12:00:00Z');
const issuer={name:'Synthetic approved issuer',address:'Synthetic address',taxNumber:'300000000000003'};
const gate={enabled:true,approvedPolicyReference:'approved-policy-1'};
function snapshot(rate=1500,unit=10000):FiscalSnapshot{
  return {version:1,issuer:{...issuer},customer:{name:'Synthetic buyer',address:'Synthetic buyer address'},currency:'SAR',
    ...calculateFiscalLines([{key:'5',title:'Frozen item',quantity:1,unitNetMinor:unit,discountMinor:0,vatBps:rate}]),
    paidMinor:11500,sourceOrderId:'2',sourceReceiptId:'3',policyReference:gate.approvedPolicyReference};
}
function fixture(policy:unknown[]=[{id:7n,request_id:8n,issuer:JSON.stringify(issuer),vat_bps:1500,policy_reference:gate.approvedPolicyReference}]){
  const calls:{query:string;values:unknown[]}[]=[];
  const query=vi.fn(async(sql:TemplateStringsArray,...values:unknown[])=>{
    const text=sql.join('?');calls.push({query:text,values});
    if(text.includes('FROM finance_tax_policies'))return policy;
    if(text.startsWith('SELECT created_at'))return [{created_at:saleAt}];
    if(text.includes('FROM finance_periods'))return [{closed_at:null,checks_json:[],reason:'',version:0}];
    if(text.includes('FROM finance_sequences'))return [{next_value:1n}];
    if(text.includes('FROM finance_invoices'))return [{id:1n,order_id:2n,receipt_id:3n,created_at:saleAt,total_minor:11500,status:'pending_policy',number:null,snapshot:null,
      source_snapshot:{customerName:'Synthetic buyer',items:[{productId:'5',title:'Frozen item',quantity:1,totalMinor:11500}],shippingMinor:0,suppliers:[]}}];
    throw Error('Unexpected query: '+text);
  });
  const execute=vi.fn(async(_sql:TemplateStringsArray,..._values:unknown[])=>1);
  const db={$transaction:async<T>(work:(tx:unknown)=>Promise<T>)=>work({$queryRaw:query,$executeRaw:execute})};
  return {db,calls,execute};
}
beforeEach(()=>vi.clearAllMocks());
const noNumber=(execute:ReturnType<typeof fixture>['execute'])=>expect(execute.mock.calls.map(call=>String(call[0])).join('\n')).not.toMatch(/finance_sequences|status='issued'/);

describe('issued invoice persisted policy authority',()=>{
  it('requires persisted approval even when the caller passes an enabled matching gate',async()=>{
    const state=fixture([]);
    await expect(issueInvoice(state.db as never,71n,1n,snapshot(),gate,issuedAt)).rejects.toThrow('finance_issuance_not_approved');
    noNumber(state.execute);
  });
  it('rejects a fabricated caller reference without consuming a document number',async()=>{
    const state=fixture(),value={...snapshot(),policyReference:'invented-policy'};
    await expect(issueInvoice(state.db as never,71n,1n,value,{enabled:true,approvedPolicyReference:value.policyReference},issuedAt)).rejects.toThrow('finance_issuance_not_approved');
    noNumber(state.execute);
  });
  it.each(['name','address','taxNumber'] as const)('rejects an issuer %s that differs from the approved policy',async field=>{
    const state=fixture(),value=snapshot();value.issuer[field]=field==='taxNumber'?'311111111111113':'Different issuer field';
    await expect(issueInvoice(state.db as never,71n,1n,value,gate,issuedAt)).rejects.toThrow('finance_issuance_not_approved');
    noNumber(state.execute);
  });
  it('rejects a mathematically exact snapshot carrying an unapproved VAT rate',async()=>{
    const state=fixture(),value=snapshot(500,10952);expect(value.totalMinor).toBe(11500);
    await expect(issueInvoice(state.db as never,71n,1n,value,gate,issuedAt)).rejects.toThrow('finance_issuance_not_approved');
    noNumber(state.execute);
  });
  it('uses the original sale calendar date and approval timestamp rather than the late issue date',async()=>{
    const state=fixture();expect(await issueInvoice(state.db as never,71n,1n,snapshot(),gate,issuedAt)).toBe('INV-2026-00000001');
    const policy=state.calls.find(call=>call.query.includes('FROM finance_tax_policies'))!;
    expect(policy.query).toContain('INNER JOIN finance_change_requests');
    expect(policy.query).toContain("r.status='approved'");expect(policy.query).toContain("r.kind='tax_settings'");
    expect(policy.query).toContain('p.effective_from<=?');expect(policy.query).toContain('p.created_at<=?');expect(policy.query).toContain('r.decided_at<=?');
    expect(policy.values).toEqual(['2026-09-01',saleAt,saleAt]);
    expect(policy.query).toContain('ORDER BY p.effective_from DESC,p.id DESC LIMIT 1');
    const audit=state.execute.mock.calls.find(call=>String(call[0]).includes('finance_audit'));
    expect(audit).toBeDefined();expect(JSON.stringify(audit,(_key,value)=>typeof value==='bigint'?String(value):value)).toContain('policyId');
  });
});
