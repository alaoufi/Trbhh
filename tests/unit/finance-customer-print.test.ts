import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),actor:vi.fn(),permission:vi.fn(),query:vi.fn(),execute:vi.fn(),transaction:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireUser:m.session}));
vi.mock('@/lib/access-control/guards',()=>({accessActor:m.actor}));
vi.mock('@/lib/access-control/financial-authorization',()=>({requireFinancePermission:m.permission,enforceFinanceChecker:vi.fn()}));
vi.mock('@/lib/finance/schema',()=>({assertFinanceSchemaReady:async()=>{},financeSchemaAvailable:async()=>true}));
vi.mock('@/lib/prisma',()=>({prisma:{$transaction:m.transaction,$queryRaw:m.query}}));
import {GET} from '@/app/account/invoices/[id]/print/route';
const now=new Date('2026-09-22T12:00:00Z');
const session={uid:44,name:'Owner',type:'member',authVersion:'current-session'};
let ownerId=44n;
let account:{auth_session_version:string;archived_at:Date|null;merged_into:bigint|null;ban:string;ban_until:Date|null};
let inTransaction=false;
const reads:{sql:string;values:unknown[];inTransaction:boolean}[]=[];
const invoice={id:91n,order_id:2n,receipt_id:3n,number:'INV-2026-91',kind:'invoice',parent_id:null,status:'issued',created_at:now,issued_at:now,total_minor:11500n,net_minor:10000n,vat_minor:1500n,reason:'',
 source_snapshot:{id:'2',memberId:'44',customerName:'Owner',status:'paid',createdAt:now.toISOString(),paidAt:now.toISOString(),subtotalMinor:11500,shippingMinor:0,totalMinor:11500,currency:'SAR',items:[{productId:'8',title:'Product',quantity:1,totalMinor:11500}],suppliers:[{supplierId:'5',supplierName:'PRIVATE_SUPPLIER',productId:'8',amountMinor:6000}]},
 snapshot:{version:1,issuer:{name:'Issuer',taxNumber:'300000000000003',address:'Riyadh'},customer:{name:'Owner'},currency:'SAR',lines:[{key:'8',title:'Product',quantity:1,unitNetMinor:10000,discountMinor:0,vatBps:1500,netMinor:10000,vatMinor:1500,grossMinor:11500,supplierId:'5',supplierMinor:6000}],netMinor:10000,vatMinor:1500,totalMinor:11500,paidMinor:11500,sourceOrderId:'2',sourceReceiptId:'3',policyReference:'PRIVATE_POLICY'}};
beforeEach(()=>{
 vi.clearAllMocks();ownerId=44n;reads.length=0;inTransaction=false;
 account={auth_session_version:'current-session',archived_at:null,merged_into:null,ban:'no',ban_until:null};
 m.session.mockResolvedValue(session);m.actor.mockResolvedValue({userId:44,ip:'127.0.0.1',sessionFingerprint:'hashed-session'});
 m.permission.mockRejectedValue(new Error('access_forbidden'));m.execute.mockResolvedValue(1);
 m.transaction.mockImplementation(async(fn:(tx:unknown)=>unknown)=>{inTransaction=true;try{return await fn({$queryRaw:m.query,$executeRaw:m.execute});}finally{inTransaction=false;}});
 m.query.mockImplementation(async(sql:TemplateStringsArray,...values:unknown[])=>{
  const query=sql.join('?');reads.push({sql:query,values,inTransaction});
  if(query.includes('FROM users'))return [account];
  if(query.includes('FROM commerce_orders'))return values.includes(ownerId)?[{id:2n}]:[];
  if(query.includes('FROM finance_invoices'))return values.includes(ownerId)?[invoice]:[];
  throw new Error('Unexpected customer print query');
 });
});
const print=(id='91')=>GET(new Request('https://app.test/account/invoices/'+id+'/print'),{params:Promise.resolve({id})});
describe('customer invoice print remains scoped to the verified owner',()=>{
 it('prints an owned document without administrative grants and audits its actual invoice ID',async()=>{
  const response=await print();expect(response.status).toBe(200);
  const html=await response.text();expect(html).toContain('INV-2026-91');expect(html).toContain('115.00');
  expect(html).not.toContain('PRIVATE_SUPPLIER');expect(html).not.toContain('PRIVATE_POLICY');
  expect(m.permission).not.toHaveBeenCalled();
  const ownerRead=reads.find(row=>row.sql.includes('o.member_id=?'))!;
  expect(ownerRead).toBeDefined();expect(ownerRead.inTransaction).toBe(true);expect(ownerRead.values).toEqual([91n,44n]);
  expect(reads.find(row=>row.sql.includes('FROM users'))?.sql).toContain('FOR UPDATE');
  expect(m.execute).toHaveBeenCalledOnce();
  const audit=m.execute.mock.calls[0];expect((audit[0] as TemplateStringsArray).join('?')).toContain('INSERT INTO finance_audit');
  expect(audit.slice(2,6)).toEqual([44n,'customer_invoice_printed','invoice','91']);
  expect(JSON.parse(audit.at(-1))).toMatchObject({ip:'127.0.0.1',sessionFingerprint:'hashed-session',after:{format:'print',orderId:'2'}});
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
 });
 it.each(['member','admin'])('never lets a non-owner %s print another customer document',async type=>{
  ownerId=99n;m.session.mockResolvedValue({...session,type});
  const response=await print();expect(response.status).toBe(404);expect(m.execute).not.toHaveBeenCalled();
  expect(m.permission).not.toHaveBeenCalled();
 });
 it.each(['archived','merged','banned','session_changed'])('denies an account that becomes %s after the route session check',async state=>{
  if(state==='archived')account.archived_at=now;
  if(state==='merged')account.merged_into=99n;
  if(state==='banned')account.ban='checked';
  if(state==='session_changed')account.auth_session_version='new-session';
  expect((await print()).status).toBe(404);expect(m.execute).not.toHaveBeenCalled();
  expect(reads.some(row=>row.sql.includes('FROM finance_invoices'))).toBe(false);
 });
 it('allows an expired temporary ban in line with the existing session policy',async()=>{
  account.ban='checked';account.ban_until=new Date('2020-01-01T00:00:00Z');expect((await print()).status).toBe(200);
 });
 it('does not return printable content when the mandatory audit write fails',async()=>{
  m.execute.mockRejectedValue(new Error('audit_unavailable'));await expect(print()).rejects.toThrow('audit_unavailable');
 });
 it('rejects malformed IDs before database access',async()=>{
  expect((await print('0')).status).toBe(404);expect(m.transaction).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled();
 });
});
