import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {execFileSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {COMMERCE_DDL} from '@/lib/commerce/schema';
import {createOrder,claimPaymentAttempt,recordPaymentReference,settleVerifiedPayment} from '@/lib/commerce/orders';
import {SUPPLIER_DDL} from '@/lib/suppliers/schema';
import {recordSupplierTracking,memberOrderTracking} from '@/lib/suppliers/tracking';
import {ACCESS_CONTROL_DDL} from '@/lib/access-control/schema';
import {permissionKeySet} from '@/lib/access-control/catalog';
import {readAccess} from '@/lib/access-control/store';
import {requireFinancePermission} from '@/lib/access-control/financial-authorization';
import {FINANCE_DDL,FINANCE_TABLES,assertFinanceSchemaReady} from '@/lib/finance/schema';
import {approveSettlement,cancelSettlement,cancelDraftInvoice,restoreDraftInvoice,captureInvoices,closeMonth,CLOSE_CHECKS,financeMonth,issueInvoice,prepareSettlement,recordExpense,releaseAccrual,reverseExpense,reverseSettlement,saveBudget,type ExpenseInput} from '@/lib/finance/service';
import {calculateFiscalLines} from '@/lib/finance/calculations';
import {issueAdjustment,recordVerifiedFinanceRefund,type VerifiedFinanceRefund} from '@/lib/finance/adjustments';
import {readFinanceData,financeJson} from '@/lib/finance/read-model';
import {buildFinanceReport} from '@/lib/finance/reports';
import {recordFinanceReconciliation} from '@/lib/finance/reconciliation';
import {requestFinanceChange,approveFinanceChange,cancelFinanceChange} from '@/lib/finance/workflows';
import {withFinanceAuditContext} from '@/lib/finance/audit-context';
import type {FiscalSnapshot} from '@/lib/finance/types';
import {isolatedFinanceUrl} from '../../vitest.finance.config';

const financeForeignKeys=[
  ['finance_expenses','reversal_of','finance_expenses','finance_expense_reversal_fk'],
  ['finance_accrual_reviews','accrual_id','commerce_supplier_accruals','finance_review_accrual_fk'],
  ['finance_settlements','supplier_id','commerce_suppliers','finance_settlement_supplier_fk'],
  ['finance_settlements','reversal_of','finance_settlements','finance_settlement_reversal_fk'],
  ['finance_settlement_lines','settlement_id','finance_settlements','finance_line_settlement_fk'],
  ['finance_settlement_lines','accrual_id','commerce_supplier_accruals','finance_line_accrual_fk'],
  ['finance_invoices','order_id','commerce_orders','finance_invoice_order_fk'],
  ['finance_invoices','receipt_id','commerce_receipts','finance_invoice_receipt_fk'],
  ['finance_invoices','parent_id','finance_invoices','finance_invoice_parent_fk'],
  ['finance_refunds','order_id','commerce_orders','finance_refund_order_fk'],
  ['finance_refunds','receipt_id','commerce_receipts','finance_refund_receipt_fk'],
  ['finance_tax_policies','request_id','finance_change_requests','finance_tax_request_fk'],
] as const;

describe('finance isolated test fixture and Prisma contract',()=>{
  it.each([
    undefined,'mysql://root:test@example.com:33309/trbhh_finance_test','mysql://root:test@127.0.0.1:3306/trbhh_finance_test',
    'mysql://root:test@127.0.0.1:33309/production','mysql://root:test@127.0.0.1:33309/trbhh_finance_test?schema=production',
    'mysql://root:test@127.0.0.1:33309/trbhh_finance_test#production','postgres://root:test@127.0.0.1:33309/trbhh_finance_test',
    'mysql://root@127.0.0.1:33309/trbhh_finance_test','mysql://app:test@127.0.0.1:33309/trbhh_finance_test',
    'mysql://root:test@127.0.0.1:33309/trbhh_finance_test/other',
  ])('refuses an unsafe database URL without attempting a connection: %s',raw=>{
    expect(()=>isolatedFinanceUrl(raw)).toThrow('Refusing non-isolated finance DB');
  });
  it('accepts only an explicit loopback finance fixture',()=>{
    expect(isolatedFinanceUrl('mysql://root:test@127.0.0.1:33309/trbhh_finance_test').pathname).toBe('/trbhh_finance_test');
  });
  it('Prisma emits every finance table, unique key and restrictive foreign key without a database connection',()=>{
    const sql=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{encoding:'utf8',timeout:20000,env:{...process.env,DATABASE_URL:'mysql://fixture:fixture@127.0.0.1:33309/trbhh_finance_test'}});
    for(const table of FINANCE_TABLES)expect(sql).toContain(`CREATE TABLE \`${table}\``);
    for(const [table,column,parent,name] of financeForeignKeys){
      expect(sql).toContain(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (\`${column}\`) REFERENCES \`${parent}\`(\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT;`);
      expect(FINANCE_DDL.find(ddl=>ddl.startsWith(`CREATE TABLE IF NOT EXISTS ${table} (`))).toContain(`CONSTRAINT ${name} FOREIGN KEY(${column}) REFERENCES ${parent}(id) ON DELETE RESTRICT ON UPDATE RESTRICT`);
    }
    for(const index of ['finance_expense_request','finance_expense_reversal','finance_settlement_request','finance_settlement_reversal','finance_invoice_source','finance_invoice_number','finance_refund_provider_reference'])expect(sql).toContain(`UNIQUE INDEX \`${index}\``);
  });
});

// Every row is synthetic. This suite never reads DATABASE_URL for connection details.
// CREATE DATABASE deliberately has no IF NOT EXISTS: an existing fixture is not ours.
const enabled=process.env.FINANCE_DB_TESTS==='1';
const actor=71n;
const checker=72n;
// Deliberate test-only grants, never DEFAULT_ROLES or is_admin bypasses.
const financeKeys=[
  'finance:view','finance:export','settlements:view','settlements:create','settlements:edit','settlements:approve','settlements:refund','settlements:delete','settlements:export',
  'budget:view','budget:edit','budget:export','expenses:view','expenses:create','expenses:approve','expenses:refund','expenses:delete','expenses:export',
  'invoices:view','invoices:create','invoices:refund','invoices:delete','invoices:export','returns:view','returns:create','returns:approve','returns:refund','returns:delete','returns:export',
  'tax:view','tax:manage_settings','tax:approve','tax:export','periods:view','periods:close_period','periods:reopen_period','periods:approve',
  'reconciliation:view','reconciliation:reconcile','reconciliation:export','audit:view','audit:export',
];
const auditKeys=financeKeys.filter(key=>key.endsWith(':view')||key.endsWith(':export'));
const accessCleanup=['access_audit','access_user_roles','access_role_permissions','access_roles','access_departments','access_control_state','users','site_settings'];
const supplierCleanup=['supplier_coordinator_notifications','supplier_order_sync_attempts','supplier_shipments','supplier_orders','supplier_reservation_allocations','supplier_stock_reservations','supplier_price_tiers','supplier_price_history','supplier_products','supplier_oauth_states','supplier_webhook_events','supplier_connections','supplier_integration_profiles'];
const at=new Date('2026-08-15T12:00:00.000Z');
const later=new Date('2026-09-15T12:00:00.000Z');
const gate={enabled:true,approvedPolicyReference:'fixture-approved-policy-v1'};
const expense:ExpenseInput={category:'hosting',description:'Synthetic hosting expense',netMinor:10000,vatMinor:1500,paidMinor:11500,occurredAt:'2026-08-15',dueAt:'2026-08-15',reference:'fixture-expense-ref',requestKey:'fixture-expense-01'};
const cleanupTables=[
  'finance_reconciliations','finance_tax_policies','finance_change_requests',
  'finance_audit','finance_refunds','finance_settlement_lines','finance_settlements','finance_accrual_reviews',
  'finance_invoices','finance_sequences','finance_expenses','finance_budgets','finance_periods',
  'commerce_supplier_accruals','commerce_receipts','commerce_order_suppliers','commerce_product_suppliers',
  'commerce_notifications','commerce_audit_events','commerce_payment_attempts','commerce_order_items',
  'commerce_orders','commerce_products','commerce_suppliers',
];
let db:PrismaClient,peer:PrismaClient,admin:PrismaClient,created=false;

async function seedExplicitAccess() {
  for(const table of accessCleanup)await db.$executeRawUnsafe(`DELETE FROM ${table}`);
  await db.$executeRaw`INSERT INTO users(id,name) VALUES(5,'Synthetic buyer'),(71,'Synthetic finance maker'),(72,'Synthetic finance checker'),(73,'Synthetic support'),(74,'Synthetic accountant'),(75,'Synthetic auditor')`;
  await db.$executeRaw`INSERT INTO access_control_state(id,initialized_at) VALUES(1,${at})`;
  await db.$executeRaw`INSERT INTO access_departments(id,name) VALUES('fixture-finance','Fixture finance'),('fixture-support','Fixture support'),('fixture-audit','Fixture audit')`;
  for(const [id,userId,departmentId,keys] of [
    ['fixture-maker',actor,'fixture-finance',financeKeys],['fixture-checker',checker,'fixture-finance',financeKeys],
    ['fixture-support',73n,'fixture-support',['messages:view','messages:create','users:view']],
    ['fixture-accountant',74n,'fixture-finance',['finance:view','invoices:view','invoices:create','expenses:view','expenses:create']],
    ['fixture-auditor',75n,'fixture-audit',auditKeys],
  ] as const){
    await db.$executeRaw`INSERT INTO access_roles(id,name,department_id) VALUES(${id},${id},${departmentId})`;
    for(const key of keys){
      if(!permissionKeySet.has(key))throw new Error(`Unknown explicit fixture permission: ${key}`);
      await db.$executeRaw`INSERT INTO access_role_permissions(role_id,permission) VALUES(${id},${key})`;
    }
    await db.$executeRaw`INSERT INTO access_user_roles(user_id,role_id) VALUES(${userId},${id})`;
  }
}

async function count(table:string):Promise<number> {
  if(!cleanupTables.includes(table))throw new Error('Unknown fixture table');
  return Number((await db.$queryRawUnsafe<{n:bigint}[]>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);
}
async function seedOrder(id=1n,options:{status?:string;currency?:string;receiptMinor?:number;at?:Date;receipt?:boolean}={}) {
  const date=options.at??at,status=options.status??'paid',currency=options.currency??'SAR';
  await db.$executeRaw`INSERT INTO commerce_products(id,title,price_minor) VALUES(${id},'Synthetic original product',11500)`;
  await db.$executeRaw`INSERT INTO commerce_orders(id,member_id,request_key,request_fingerprint,status,currency,subtotal_minor,shipping_fee_minor,total_minor,shipping,created_at,paid_at) VALUES(${id},5,${`fixture-order-${id}`},${'f'.repeat(64)},${status},${currency},11500,0,11500,'{"name":"Synthetic customer"}',${date},${status==='paid'?date:null})`;
  await db.$executeRaw`INSERT INTO commerce_order_items(order_id,product_id,title,quantity,unit_price_minor,total_minor) VALUES(${id},${id},'Synthetic original product',1,11500,11500)`;
  await db.$executeRaw`INSERT INTO commerce_order_suppliers(order_id,product_id,supplier_id,supplier_name,quantity,unit_cost_minor,total_cost_minor) VALUES(${id},${id},1,'Synthetic supplier',1,7000,7000)`;
  await db.$executeRaw`INSERT INTO commerce_supplier_accruals(id,order_id,product_id,supplier_id,amount_minor,created_at) VALUES(${id},${id},${id},1,7000,${date})`;
  if(options.receipt!==false)await db.$executeRaw`INSERT INTO commerce_receipts(id,order_id,provider,provider_ref,amount_minor,currency,recorded_at) VALUES(${id},${id},'fixture',${`fixture-receipt-${id}`},${options.receiptMinor??11500},${currency},${date})`;
}
function fiscal(id=1n):FiscalSnapshot {
  const calculated=calculateFiscalLines([{key:String(id),title:'Synthetic original product',quantity:1,unitNetMinor:10000,discountMinor:0,vatBps:1500,supplierId:'1',supplierMinor:7000}]);
  return {version:1,issuer:{name:'Synthetic fixture issuer',taxNumber:'300000000000003',address:'Fixture address'},customer:{name:'Synthetic customer',address:'Fixture address'},currency:'SAR',...calculated,paidMinor:11500,sourceOrderId:String(id),sourceReceiptId:String(id),policyReference:gate.approvedPolicyReference};
}
/** Synthetic approval predates every fixture sale; never seeds a live policy. */
async function seedApprovedTaxPolicy(){
  const approvedAt=new Date('2026-07-31T12:00:00Z');
  const payload={effectiveFrom:'2026-08-01',issuer:fiscal().issuer,vatBps:1500,policyReference:gate.approvedPolicyReference};
  await db.$executeRaw`INSERT INTO finance_change_requests(request_key,fingerprint,kind,target_id,payload,status,maker_id,checker_id,reason,approval_reason,created_at,decided_at) VALUES('fixture-initial-tax-approval',${'a'.repeat(64)},'tax_settings','tax',${JSON.stringify(payload)},'approved',${actor},${checker},'Synthetic initial policy','Synthetic independent approval',${approvedAt},${approvedAt})`;
  const [request]=await db.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_change_requests WHERE request_key='fixture-initial-tax-approval'`;
  await db.$executeRaw`INSERT INTO finance_tax_policies(request_id,effective_from,issuer,vat_bps,policy_reference,created_at) VALUES(${request.id},${payload.effectiveFrom},${JSON.stringify(payload.issuer)},${payload.vatBps},${payload.policyReference},${approvedAt})`;
}
function refund(externalId='fixture-refund-01',amountMinor=7000):VerifiedFinanceRefund {
  return {verified:true,status:'refunded',provider:'fixture',externalId,receiptId:'1',orderId:'1',amountMinor,currency:'SAR',refundedAt:at.toISOString(),evidenceRef:'fixture-confirmed-gateway-evidence'};
}
async function capturedId(orderId=1n):Promise<bigint> {
  await captureInvoices(db,actor);
  const [row]=await db.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_invoices WHERE order_id=${orderId} AND kind='invoice'`;
  if(!row)throw new Error('Fixture invoice missing');
  return row.id;
}
async function draft(key='fixture-settlement-01',ids=[1n]) {
  return prepareSettlement(db,actor,{supplierId:1n,accrualIds:ids,requestKey:key,reason:'Synthetic payout reviewed'},at);
}
async function release(id=1n) {await releaseAccrual(db,actor,id,'2026-08-15','Synthetic due-date approval',at);}
const returnInput=(id:bigint,key='fixture-return-01',quantity=1)=>({kind:'return' as const,targetId:String(id),payload:{lines:[{key:'1',quantity}]},reason:'Synthetic inspected return',requestKey:key});
async function report(month:string,now:Date){return buildFinanceReport(await readFinanceData(db),{month,section:'overview',mode:'accountant'},now);}
async function issuedOrder(){await seedOrder();const id=await capturedId();await issueInvoice(db,actor,id,fiscal(),gate,at);return id;}
async function failAudit(run:()=>Promise<unknown>) {
  // A real storage failure, after preceding writes in the same transaction.
  // ALTER works through MySQL's prepared protocol; CREATE TRIGGER does not.
  // Existing audit rows survive the additive column and its later removal.
  await db.$executeRawUnsafe('ALTER TABLE finance_audit ADD COLUMN fixture_required INT NOT NULL');
  try {
    await expect(run()).rejects.toMatchObject({code:'P2010',meta:{code:'1364',message:expect.stringContaining('fixture_required')}});
  } finally {await db.$executeRawUnsafe('ALTER TABLE finance_audit DROP COLUMN fixture_required');}
}

describe.skipIf(!enabled)('isolated finance MySQL transaction proof',()=>{
  beforeAll(async()=>{
    const url=isolatedFinanceUrl(process.env.FINANCE_TEST_DATABASE_URL);
    db=new PrismaClient({datasourceUrl:url.href,log:[]});
    peer=new PrismaClient({datasourceUrl:url.href,log:[]});
    const adminUrl=new URL(url);adminUrl.pathname='/mysql';
    admin=new PrismaClient({datasourceUrl:adminUrl.href,log:[]});
    await admin.$executeRawUnsafe('CREATE DATABASE trbhh_finance_test');
    created=true;
    expect((await db.$queryRaw<{name:string}[]>`SELECT DATABASE() AS name`)[0].name).toBe('trbhh_finance_test');
    const [modes]=await db.$queryRaw<{globalMode:string;sessionMode:string}[]>`SELECT @@GLOBAL.sql_mode AS globalMode,@@SESSION.sql_mode AS sessionMode`;
    // Pool connections inherit the global mode; a permissive server must not silently
    // turn our storage-failure injection into an implicit default value.
    for(const mode of [modes.globalMode,modes.sessionMode])expect(mode).toMatch(/\bSTRICT_(?:TRANS|ALL)_TABLES\b/);
    await db.$executeRawUnsafe(`CREATE TABLE users(id BIGINT UNSIGNED NOT NULL PRIMARY KEY,name VARCHAR(255) NULL,userName VARCHAR(255) NULL,phoneNumber VARCHAR(255) NULL,is_admin TINYINT NOT NULL DEFAULT 0,ban ENUM('checked','no') NULL DEFAULT 'no',ban_until DATETIME NULL,archived_at DATETIME NULL,merged_into BIGINT NULL,auth_session_version VARCHAR(64) NOT NULL DEFAULT '0') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    await db.$executeRawUnsafe(`CREATE TABLE site_settings(k VARCHAR(100) NOT NULL PRIMARY KEY,v TEXT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    for(const ddl of [...ACCESS_CONTROL_DDL,...COMMERCE_DDL,...SUPPLIER_DDL,...FINANCE_DDL])await db.$executeRawUnsafe(ddl);
    await assertFinanceSchemaReady(db);
  });
  afterAll(async()=>{
    await Promise.all([db?.$disconnect(),peer?.$disconnect()]);
    try {if(created)await admin.$executeRawUnsafe('DROP DATABASE trbhh_finance_test');}
    finally {await admin?.$disconnect();}
  });
  beforeEach(async()=>{
    // Self-referencing reversals/notes must be removed before their originals.
    await db.$executeRaw`DELETE FROM finance_settlement_lines`;
    await db.$executeRaw`DELETE FROM finance_settlements WHERE reversal_of IS NOT NULL`;
    await db.$executeRaw`DELETE FROM finance_expenses WHERE reversal_of IS NOT NULL`;
    await db.$executeRaw`DELETE FROM finance_invoices WHERE parent_id IS NOT NULL`;
    for(const table of supplierCleanup)await db.$executeRawUnsafe(`DELETE FROM ${table}`);
    for(const table of cleanupTables)await db.$executeRawUnsafe(`DELETE FROM ${table}`);
    await seedExplicitAccess();
    await seedApprovedTaxPolicy();
    await db.$executeRaw`INSERT INTO commerce_suppliers(id,name) VALUES(1,'Synthetic supplier'),(2,'Other synthetic supplier')`;
  });

  it('owns a newly created database and refuses to replace an existing one',async()=>{
    await expect(admin.$executeRawUnsafe('CREATE DATABASE trbhh_finance_test')).rejects.toThrow();
    expect(await count('commerce_suppliers')).toBe(2);
  });
  it('grants only explicit multi-department duties: support has no finance and accountant has no users',async()=>{
    const support=await readAccess(db,73),accountant=await readAccess(db,74),auditor=await readAccess(db,75);
    expect(support.ready&&accountant.ready&&auditor.ready).toBe(true);
    expect([...support.keys].sort()).toEqual(['messages:create','messages:view','users:view']);
    expect(accountant.keys.has('finance:view')).toBe(true);expect(accountant.keys.has('users:view')).toBe(false);
    expect(accountant.keys.has('access_control:manage_settings')).toBe(false);
    expect([...auditor.keys].sort()).toEqual([...auditKeys].sort());
    for(const [uid,key] of [[73n,'finance:view'],[74n,'users:view'],[75n,'settlements:approve'],[75n,'expenses:create'],[75n,'tax:manage_settings']] as const){
      await expect(db.$transaction(tx=>requireFinancePermission(tx,uid,key))).rejects.toThrow('access_forbidden');
    }
    await db.$transaction(tx=>requireFinancePermission(tx,75n,'finance:export'));
    await db.$transaction(tx=>requireFinancePermission(tx,75n,'audit:export'));
    expect(await count('finance_audit')).toBe(0);
  });
  it('rejects direct financial service writes by support and read-only auditor without any financial mutation',async()=>{
    await seedOrder();
    for(const uid of [73n,75n]){
      await expect(recordExpense(db,uid,expense)).rejects.toThrow('access_forbidden');
      await expect(saveBudget(db,uid,{month:'2026-08',category:'hosting',plannedMinor:100,reason:'Synthetic denied budget'})).rejects.toThrow('access_forbidden');
      await expect(captureInvoices(db,uid)).rejects.toThrow('access_forbidden');
      await expect(releaseAccrual(db,uid,1n,'2026-08-15','No grant',at)).rejects.toThrow('access_forbidden');
      await expect(recordVerifiedFinanceRefund(db,uid,refund(),gate,at)).rejects.toThrow('access_forbidden');
      await expect(closeMonth(db,uid,'2026-08',[...CLOSE_CHECKS],'No grant',later)).rejects.toThrow('access_forbidden');
    }
    for(const table of FINANCE_TABLES)expect(await count(table)).toBe(0);
    expect(await count('commerce_receipts')).toBe(1);
  });
  it('rechecks permissions after a prior successful read and after department revocation',async()=>{
    expect((await readAccess(db,Number(actor))).keys.has('expenses:create')).toBe(true);
    await db.$executeRaw`DELETE FROM access_role_permissions WHERE role_id='fixture-maker' AND permission='expenses:create'`;
    await expect(recordExpense(db,actor,expense)).rejects.toThrow('access_forbidden');
    await db.$executeRaw`UPDATE access_departments SET active=0 WHERE id='fixture-finance'`;
    await expect(recordExpense(db,checker,expense)).rejects.toThrow('access_forbidden');
    expect(await count('finance_expenses')).toBe(0);expect(await count('finance_periods')).toBe(0);expect(await count('finance_audit')).toBe(0);
  });
  it('requires both module view and its action, and refuses an uninitialized access graph',async()=>{
    await db.$executeRaw`DELETE FROM access_role_permissions WHERE role_id='fixture-maker' AND permission='expenses:view'`;
    await expect(recordExpense(db,actor,expense)).rejects.toThrow('access_forbidden');
    await db.$executeRaw`UPDATE access_control_state SET initialized_at=NULL WHERE id=1`;
    await expect(recordExpense(db,checker,expense)).rejects.toThrow('access_forbidden');
    expect(await count('finance_expenses')).toBe(0);expect(await count('finance_audit')).toBe(0);
  });
  it('serializes an in-flight grant revocation before a financial mutation can authorize',async()=>{
    let locked!:()=>void,unlock!:()=>void;
    const reached=new Promise<void>(resolve=>{locked=resolve;}),resume=new Promise<void>(resolve=>{unlock=resolve;});
    const revoke=db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM access_control_state WHERE id=1 FOR UPDATE`;
      await tx.$executeRaw`DELETE FROM access_role_permissions WHERE role_id='fixture-maker' AND permission='expenses:create'`;
      locked();await resume;
    });
    await reached;
    const write=recordExpense(peer,actor,expense);
    // Attach the rejection handler immediately; release the real MySQL lock next.
    const rejected=expect(write).rejects.toThrow('access_forbidden');
    unlock();await revoke;await rejected;
    expect(await count('finance_expenses')).toBe(0);expect(await count('finance_audit')).toBe(0);
  });
  it('installs idempotently and preserves actual restrictive foreign keys and InnoDB tables',async()=>{
    for(const ddl of FINANCE_DDL)await db.$executeRawUnsafe(ddl);
    await assertFinanceSchemaReady(db);
    const tables=await db.$queryRaw<{name:string;engine:string}[]>`SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()`;
    for(const name of FINANCE_TABLES)expect(tables).toContainEqual({name,engine:'InnoDB'});
    const keys=await db.$queryRaw<{name:string;deletion:string;updates:string}[]>`SELECT CONSTRAINT_NAME AS name,DELETE_RULE AS deletion,UPDATE_RULE AS updates FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()`;
    for(const [,,,name] of financeForeignKeys)expect(keys).toContainEqual({name,deletion:'RESTRICT',updates:'RESTRICT'});
  });
  it('fails closed before writing when an idempotency index is missing',async()=>{
    await db.$executeRawUnsafe('ALTER TABLE finance_expenses DROP INDEX finance_expense_request');
    try {await expect(recordExpense(db,actor,expense)).rejects.toThrow('finance_schema_not_ready');expect(await count('finance_expenses')).toBe(0);}
    finally {await db.$executeRawUnsafe('ALTER TABLE finance_expenses ADD UNIQUE KEY finance_expense_request(request_key)');}
  });
  it('captures one receipt once across independent concurrent clients and preserves its source snapshot',async()=>{
    await seedOrder();
    const results=await Promise.all([captureInvoices(db,actor),captureInvoices(peer,actor)]);
    expect(results.reduce((a,b)=>a+b,0)).toBe(1);
    const before=await db.$queryRaw<{id:bigint;source_snapshot:unknown;status:string;number:string|null;snapshot:unknown}[]>`SELECT id,source_snapshot,status,number,snapshot FROM finance_invoices`;
    expect(before).toHaveLength(1);expect(before[0]).toMatchObject({status:'pending_policy',number:null,snapshot:null});
    expect(financeJson(before[0].source_snapshot)).toMatchObject({customerName:'Synthetic customer',items:[{title:'Synthetic original product',unitMinor:11500}],suppliers:[{amountMinor:7000}]});
    await db.$executeRaw`UPDATE commerce_products SET title='Edited catalog title',price_minor=25000 WHERE id=1`;
    await db.$executeRaw`UPDATE commerce_orders SET shipping='{"name":"Edited customer"}' WHERE id=1`;
    await db.$executeRaw`UPDATE commerce_order_items SET title='Edited order title' WHERE order_id=1`;
    expect(await captureInvoices(db,actor)).toBe(0);
    expect(await db.$queryRaw`SELECT id,source_snapshot,status,number,snapshot FROM finance_invoices`).toEqual(before);
    expect(await count('finance_audit')).toBe(1);
  });
  it('does not capture unpaid, mismatched-amount, foreign-currency or missing receipts',async()=>{
    await seedOrder(1n,{status:'awaiting_payment'});await seedOrder(2n,{receiptMinor:11499});
    await seedOrder(3n,{currency:'USD'});await seedOrder(4n,{receipt:false});
    expect(await captureInvoices(db,actor)).toBe(0);expect(await count('finance_invoices')).toBe(0);expect(await count('finance_audit')).toBe(0);
  });
  it('assigns unique sequential numbers under concurrency and refuses changed issued snapshots',async()=>{
    await seedOrder(1n);await seedOrder(2n);
    const first=await capturedId(1n),second=await capturedId(2n);
    const numbers=await Promise.all([issueInvoice(db,actor,first,fiscal(1n),gate,at),issueInvoice(peer,actor,second,fiscal(2n),gate,at)]);
    expect(numbers.sort()).toEqual(['INV-2026-00000001','INV-2026-00000002']);
    const before=await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${first}`;
    const [saved]=await db.$queryRaw<{number:string}[]>`SELECT number FROM finance_invoices WHERE id=${first}`;
    expect(await issueInvoice(db,actor,first,fiscal(),gate,at)).toBe(saved.number);
    await expect(issueInvoice(db,actor,first,{...fiscal(),customer:{name:'Changed customer',address:'Changed'}},gate,at)).rejects.toThrow('finance_invoice_immutable');
    expect(await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${first}`).toEqual(before);
    expect((await db.$queryRaw<{next_value:bigint}[]>`SELECT next_value FROM finance_sequences WHERE name='INV-2026'`)[0].next_value).toBe(3n);
    expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM finance_audit WHERE action='invoice_issued'`)[0].n).toBe(2n);
  });
  it('blocks issuance without the approved policy and rejects a source mismatch before numbering',async()=>{
    await seedOrder();const id=await capturedId();
    await expect(issueInvoice(db,actor,id,fiscal(),{...gate,enabled:false},at)).rejects.toThrow('finance_issuance_not_approved');
    await expect(issueInvoice(db,actor,id,{...fiscal(),sourceReceiptId:'99'},gate,at)).rejects.toThrow('finance_invoice_difference');
    expect(await count('finance_sequences')).toBe(0);
    expect((await readFinanceData(db)).invoices[0].status).toBe('pending_policy');
  });
  it('rejects a fabricated policy reference or missing persisted policy even with an enabled caller gate',async()=>{
    await seedOrder();const id=await capturedId(),before=await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`;
    await expect(issueInvoice(db,actor,id,{...fiscal(),policyReference:'invented-policy'},{enabled:true,approvedPolicyReference:'invented-policy'},at)).rejects.toThrow('finance_issuance_not_approved');
    await db.$executeRaw`DELETE FROM finance_tax_policies`;
    await expect(issueInvoice(db,actor,id,fiscal(),gate,at)).rejects.toThrow('finance_issuance_not_approved');
    expect(await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`).toEqual(before);
    expect(await count('finance_sequences')).toBe(0);expect(await count('finance_audit')).toBe(1);
  });
  it.each(['pending','cancelled'])('rejects a persisted policy whose approval request is %s',async status=>{
    await seedOrder();const id=await capturedId(),before=await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`;
    await db.$executeRaw`UPDATE finance_change_requests SET status=${status} WHERE request_key='fixture-initial-tax-approval'`;
    await expect(issueInvoice(db,actor,id,fiscal(),gate,at)).rejects.toThrow('finance_issuance_not_approved');
    expect(await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`).toEqual(before);expect(await count('finance_sequences')).toBe(0);
  });
  it('rejects a policy that became effective only after the original sale, even during later issuance',async()=>{
    await seedOrder();const id=await capturedId();
    await db.$executeRaw`UPDATE finance_tax_policies SET effective_from='2026-09-01'`;
    await expect(issueInvoice(db,actor,id,fiscal(),gate,later)).rejects.toThrow('finance_issuance_not_approved');
    expect((await readFinanceData(db)).invoices[0].status).toBe('pending_policy');expect(await count('finance_sequences')).toBe(0);
  });
  it.each(['policy_creation','approval_decision'])('rejects a policy backdated to the sale with late %s',async lateField=>{
    await seedOrder();const id=await capturedId();
    if(lateField==='policy_creation')await db.$executeRaw`UPDATE finance_tax_policies SET created_at=${later}`;
    else await db.$executeRaw`UPDATE finance_change_requests SET decided_at=${later} WHERE request_key='fixture-initial-tax-approval'`;
    await expect(issueInvoice(db,actor,id,fiscal(),gate,later)).rejects.toThrow('finance_issuance_not_approved');
    expect((await readFinanceData(db)).invoices[0].status).toBe('pending_policy');expect(await count('finance_sequences')).toBe(0);
  });
  it('rejects a different issuer or an exact total calculated with an unapproved rate without consuming a number',async()=>{
    await seedOrder();const id=await capturedId(),before=await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`;
    const changedIssuer={...fiscal(),issuer:{...fiscal().issuer,address:'Unapproved address'}};
    const changedRate={...fiscal(),...calculateFiscalLines([{...fiscal().lines[0],vatBps:500,unitNetMinor:10952}])};
    expect(changedRate.totalMinor).toBe(11500);
    for(const snapshot of [changedIssuer,changedRate])await expect(issueInvoice(db,actor,id,snapshot,gate,at)).rejects.toThrow('finance_issuance_not_approved');
    expect(await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`).toEqual(before);expect(await count('finance_sequences')).toBe(0);
  });
  it('requires the latest approved policy effective at sale and records its persisted authority',async()=>{
    const approvalAt=new Date('2026-08-09T12:00:00Z'),reference='fixture-new-effective-policy';
    const requestId=await requestFinanceChange(db,actor,{kind:'tax_settings',targetId:'tax',payload:{effectiveFrom:'2026-08-10',issuer:fiscal().issuer,vatBps:1500,policyReference:reference},reason:'Synthetic prospective replacement',requestKey:'fixture-replacement-tax'},approvalAt);
    const approval=await approveFinanceChange(db,checker,requestId,'Synthetic independent review',approvalAt);
    await seedOrder();const id=await capturedId();
    await expect(issueInvoice(db,actor,id,fiscal(),gate,at)).rejects.toThrow('finance_issuance_not_approved');
    expect(await issueInvoice(db,actor,id,{...fiscal(),policyReference:reference},{enabled:true,approvedPolicyReference:reference},at)).toBe('INV-2026-00000001');
    const audit=(await readFinanceData(db)).audit.find(row=>row.action==='invoice_issued');
    expect(audit?.payload).toMatchObject({policyId:approval?.policyId,policyRequestId:String(requestId),policyReference:reference});
  });
  it('rejects missing or mismatched supplier allocation without issuing or consuming a number',async()=>{
    await seedOrder();const id=await capturedId();const before=await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`;
    for(const allocation of [{supplierId:undefined,supplierMinor:undefined},{supplierId:'2',supplierMinor:7000},{supplierId:'1',supplierMinor:6999}]){
      const snapshot=fiscal();snapshot.lines=snapshot.lines.map(line=>({...line,...allocation}));
      await expect(issueInvoice(db,actor,id,snapshot,gate,at)).rejects.toThrow('finance_supplier_snapshot_difference');
      expect(await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`).toEqual(before);
      expect(await count('finance_sequences')).toBe(0);
    }
    expect(await count('finance_audit')).toBe(1);
  });
  it('rejects changed customer and product names before first issuance without altering the captured source',async()=>{
    await seedOrder();const id=await capturedId();const before=await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`;
    const customerChanged=fiscal();customerChanged.customer.name='Different customer';
    const productChanged=fiscal();productChanged.lines[0].title='Different product';
    for(const snapshot of [customerChanged,productChanged]){
      await expect(issueInvoice(db,actor,id,snapshot,gate,at)).rejects.toThrow(/finance_/);
      expect(await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`).toEqual(before);
      expect(await count('finance_sequences')).toBe(0);
    }
    expect(await count('finance_audit')).toBe(1);
  });
  it('issues a prior-month receipt only while both periods are open and retains its accounting date',async()=>{
    await seedOrder();const id=await capturedId();
    const policyAt=new Date('2026-08-16T12:00:00Z');
    const requestId=await requestFinanceChange(db,actor,{kind:'tax_settings',targetId:'tax',payload:{effectiveFrom:'2026-09-01',issuer:fiscal().issuer,vatBps:500,policyReference:'fixture-policy-after-sale'},reason:'Synthetic future policy',requestKey:'fixture-late-issue-policy'},policyAt);
    await approveFinanceChange(db,checker,requestId,'Synthetic independent review',policyAt);
    expect(await issueInvoice(db,actor,id,fiscal(),gate,later)).toBe('INV-2026-00000001');
    const [row]=await db.$queryRaw<{created_at:Date;issued_at:Date}[]>`SELECT created_at,issued_at FROM finance_invoices WHERE id=${id}`;
    expect(row).toEqual({created_at:at,issued_at:later});
    expect((await readFinanceData(db)).invoices[0]).toMatchObject({at:at.toISOString(),issuedAt:later.toISOString()});
    expect(await db.$queryRaw`SELECT month,closed_at FROM finance_periods ORDER BY month`).toEqual([{month:'2026-08',closed_at:null},{month:'2026-09',closed_at:null}]);
  });
  it('blocks late issuance against a closed source month without changing any period or invoice',async()=>{
    await seedOrder();const id=await capturedId();
    // Simulates a restored closed-period document; normal closure rejects pending policy.
    await db.$executeRaw`UPDATE finance_periods SET closed_at=${later},checks_json=${JSON.stringify([...CLOSE_CHECKS])},reason='Closed fixture source period',version=1 WHERE month='2026-08'`;
    const invoiceBefore=await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`;
    const periodsBefore=await db.$queryRaw`SELECT * FROM finance_periods ORDER BY month`;
    await expect(issueInvoice(db,actor,id,fiscal(),gate,later)).rejects.toThrow('finance_period_closed');
    expect(await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`).toEqual(invoiceBefore);
    expect(await db.$queryRaw`SELECT * FROM finance_periods ORDER BY month`).toEqual(periodsBefore);
    expect(await count('finance_sequences')).toBe(0);expect(await count('finance_audit')).toBe(1);
  });
  it('records confirmed refunds once and rejects changed duplicate evidence or a disabled adapter',async()=>{
    await seedOrder();await seedOrder(2n);
    await expect(recordVerifiedFinanceRefund(db,actor,refund(),{enabled:false},at)).rejects.toThrow('finance_refund_unverified');
    await expect(recordVerifiedFinanceRefund(db,actor,{...refund(),verified:false},gate,at)).rejects.toThrow('finance_refund_unverified');
    const ids=await Promise.all([recordVerifiedFinanceRefund(db,actor,refund(),gate,at),recordVerifiedFinanceRefund(peer,actor,refund(),gate,at)]);
    expect(ids[0]).toBe(ids[1]);expect(await count('finance_refunds')).toBe(1);expect(await count('finance_audit')).toBe(1);
    await expect(recordVerifiedFinanceRefund(db,actor,refund('fixture-refund-01',6999),gate,at)).rejects.toThrow('finance_idempotency_conflict');
    await expect(recordVerifiedFinanceRefund(db,actor,{...refund(),receiptId:'2',orderId:'2'},gate,at)).rejects.toThrow('finance_idempotency_conflict');
    expect((await readFinanceData(db)).refunds).toMatchObject([{amountMinor:7000,orderId:'1',receiptId:'1',provider:'fixture'}]);
    expect(await count('finance_invoices')).toBe(0);
  });
  it('prevents concurrent refund events from exceeding the original receipt',async()=>{
    await seedOrder();
    const results=await Promise.allSettled([recordVerifiedFinanceRefund(db,actor,refund('fixture-refund-race-a'),gate,at),recordVerifiedFinanceRefund(peer,actor,refund('fixture-refund-race-b'),gate,at)]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    const failed=results.find(result=>result.status==='rejected');
    expect(failed?.status==='rejected'?String(failed.reason):'').toContain('finance_refund_exceeds_paid');
    expect(await count('finance_refunds')).toBe(1);
    await recordVerifiedFinanceRefund(db,actor,refund('fixture-refund-remainder',4500),gate,at);
    await expect(recordVerifiedFinanceRefund(db,actor,refund('fixture-refund-one-extra',1),gate,at)).rejects.toThrow('finance_refund_exceeds_paid');
    expect((await readFinanceData(db)).refunds.reduce((sum,row)=>sum+row.amountMinor,0)).toBe(11500);
  });
  it('caps credit notes at the original invoice, preserves it, and permits one debit restoration',async()=>{
    await seedOrder();const id=await capturedId();await issueInvoice(db,actor,id,fiscal(),gate,at);
    const original=await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`;
    const input={originalId:id,kind:'credit_note' as const,requestKey:'fixture-credit-01',reason:'Fixture approved return',snapshot:fiscal()};
    const numbers=await Promise.all([issueAdjustment(db,actor,input,gate,at),issueAdjustment(peer,actor,input,gate,at)]);
    expect(numbers).toEqual(['CRN-2026-00000001','CRN-2026-00000001']);
    await expect(issueAdjustment(db,actor,{...input,requestKey:'fixture-credit-exceeds'},gate,at)).rejects.toThrow('finance_note_exceeds_original');
    expect(await issueAdjustment(db,actor,{...input,kind:'debit_note',requestKey:'fixture-debit-01',reason:'Restore prior credit'},gate,at)).toBe('DBN-2026-00000001');
    await expect(issueAdjustment(db,actor,{...input,kind:'debit_note',requestKey:'fixture-debit-exceeds'},gate,at)).rejects.toThrow('finance_note_exceeds_original');
    expect(await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`).toEqual(original);
    expect(await count('finance_invoices')).toBe(3);expect(await count('finance_refunds')).toBe(0);
  });
  it('records a paid-supplier return as a recoverable negative balance without rewriting its paid settlement',async()=>{
    await seedOrder();await release();const settlement=await draft();await approveSettlement(db,checker,settlement,'fixture-transfer',at);
    const id=await capturedId();await issueInvoice(db,actor,id,fiscal(),gate,at);
    const paidBefore=await db.$queryRaw`SELECT * FROM finance_settlements WHERE id=${settlement}`;
    expect(await issueAdjustment(db,actor,{originalId:id,kind:'credit_note',requestKey:'fixture-credit-paid-supplier',reason:'Supplier already paid',snapshot:fiscal()},gate,at)).toBe('CRN-2026-00000001');
    expect(await count('finance_invoices')).toBe(2);
    expect(await db.$queryRaw`SELECT * FROM finance_settlements WHERE id=${settlement}`).toEqual(paidBefore);
    expect((await report('2026-08',at)).suppliers.find(supplier=>supplier.id==='1')?.remainingMinor).toBe(-7000);
    await expect(draft('fixture-negative-balance')).rejects.toThrow('finance_supplier_recovery_outstanding');
    await seedOrder(2n);await release(2n);
    await expect(draft('fixture-new-order-with-old-debt',[2n])).rejects.toThrow('finance_supplier_recovery_outstanding');
    expect((await readFinanceData(db)).settlements[0].status).toBe('approved');
  });
  it('does not restore credit through a debit note after the corresponding money was refunded',async()=>{
    await seedOrder();const id=await capturedId();await issueInvoice(db,actor,id,fiscal(),gate,at);
    const input={originalId:id,kind:'credit_note' as const,requestKey:'fixture-credit-before-refund',reason:'Approved return',snapshot:fiscal()};
    await issueAdjustment(db,actor,input,gate,at);
    await recordVerifiedFinanceRefund(db,actor,refund('fixture-confirmed-full-refund',11500),gate,at);
    const before=await readFinanceData(db);
    await expect(issueAdjustment(db,actor,{...input,kind:'debit_note',requestKey:'fixture-debit-after-refund',reason:'Cannot restore paid refund'},gate,at)).rejects.toThrow('finance_note_refund_already_paid');
    expect(await readFinanceData(db)).toEqual(before);
    expect(await db.$queryRaw`SELECT name FROM finance_sequences WHERE name='DBN-2026'`).toEqual([]);
  });
  it('rolls back refund and credit-note storage if their audit record fails',async()=>{
    await seedOrder();await failAudit(()=>recordVerifiedFinanceRefund(db,actor,refund(),gate,at));
    expect(await count('finance_refunds')).toBe(0);expect(await count('finance_audit')).toBe(0);
    const id=await capturedId();await issueInvoice(db,actor,id,fiscal(),gate,at);
    const input={originalId:id,kind:'credit_note' as const,requestKey:'fixture-credit-audit-fail',reason:'Synthetic adjustment',snapshot:fiscal()};
    await failAudit(()=>issueAdjustment(db,actor,input,gate,at));
    expect(await count('finance_invoices')).toBe(1);
    expect(await db.$queryRaw`SELECT name FROM finance_sequences WHERE name='CRN-2026'`).toEqual([]);
    expect(await issueAdjustment(db,actor,input,gate,at)).toBe('CRN-2026-00000001');
  });
  it('allows only one concurrent approval of two drafts for the same supplier accrual',async()=>{
    await seedOrder();await release();
    const first=await draft('fixture-payout-race-a'),second=await draft('fixture-payout-race-b');
    const results=await Promise.allSettled([approveSettlement(db,checker,first,'transfer-a',at),approveSettlement(peer,checker,second,'transfer-b',at)]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    const failed=results.find(result=>result.status==='rejected');
    expect(failed?.status==='rejected'?String(failed.reason):'').toContain('finance_already_settled');
    const rows=await db.$queryRaw<{status:string;amount_minor:bigint}[]>`SELECT status,amount_minor FROM finance_settlements ORDER BY status`;
    expect(rows).toEqual([{status:'approved',amount_minor:7000n},{status:'draft',amount_minor:7000n}]);
    expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM finance_audit WHERE action='settlement_approved'`)[0].n).toBe(1n);
  });
  it('deduplicates a draft request and approval reference but rejects a reused key with different meaning',async()=>{
    await seedOrder();await release();const id=await draft();
    expect(await draft()).toBe(id);
    await expect(prepareSettlement(db,actor,{supplierId:1n,accrualIds:[1n],requestKey:'fixture-settlement-01',reason:'Different reason'},at)).rejects.toThrow('finance_idempotency_conflict');
    await approveSettlement(db,checker,id,'fixture-transfer',at);await approveSettlement(peer,checker,id,'fixture-transfer',at);
    await expect(approveSettlement(db,checker,id,'different-transfer',at)).rejects.toThrow('finance_idempotency_conflict');
    expect(await count('finance_settlements')).toBe(1);expect(await count('finance_settlement_lines')).toBe(1);
    expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM finance_audit WHERE action='settlement_approved'`)[0].n).toBe(1n);
  });
  it('rejects unreviewed, future-due and other-supplier accruals without partial drafts',async()=>{
    await seedOrder();await expect(draft()).rejects.toThrow('finance_accrual_not_due');
    await releaseAccrual(db,actor,1n,'2026-08-20','Future due date',at);
    await expect(draft()).rejects.toThrow('finance_accrual_not_due');
    await expect(prepareSettlement(db,actor,{supplierId:2n,accrualIds:[1n],requestKey:'fixture-wrong-supplier',reason:'Wrong supplier'},later)).rejects.toThrow('finance_accrual_not_due');
    expect(await count('finance_settlements')).toBe(0);expect(await count('finance_settlement_lines')).toBe(0);
  });
  it('records one immutable settlement reversal and makes exactly that amount available again',async()=>{
    await seedOrder();await release();const original=await draft();await approveSettlement(db,checker,original,'fixture-transfer',at);
    const before=(await db.$queryRaw<{amount_minor:bigint;reference:string}[]>`SELECT amount_minor,reference FROM finance_settlements WHERE id=${original}`)[0];
    const reversals=await Promise.all([reverseSettlement(db,actor,original,'Transfer corrected',at),reverseSettlement(peer,actor,original,'Transfer corrected',at)]);
    expect(reversals[0]).toBe(reversals[1]);
    expect((await db.$queryRaw<{amount_minor:bigint;reference:string}[]>`SELECT amount_minor,reference FROM finance_settlements WHERE id=${original}`)[0]).toEqual(before);
    expect((await db.$queryRaw<{status:string}[]>`SELECT status FROM finance_settlements WHERE id=${original}`)[0].status).toBe('reversed');
    expect(await count('finance_settlements')).toBe(2);expect(await count('finance_settlement_lines')).toBe(2);
    await expect(reverseSettlement(db,actor,reversals[0],'Cannot reverse a reversal',at)).rejects.toThrow('finance_reversal_invalid');
    const replacement=await draft('fixture-after-reversal');await approveSettlement(db,checker,replacement,'replacement-transfer',at);
    const paid=await db.$queryRaw<{amount_minor:bigint;reversal_of:bigint|null}[]>`SELECT amount_minor,reversal_of FROM finance_settlements WHERE status IN ('approved','reversed')`;
    expect(paid.reduce((sum,row)=>sum+row.amount_minor*(row.reversal_of?-1n:1n),0n)).toBe(7000n);
    await expect(draft('fixture-overpay-blocked')).rejects.toThrow('finance_already_settled');
  });
  it('records an expense once and reverses it once without changing the original',async()=>{
    const ids=await Promise.all([recordExpense(db,actor,expense),recordExpense(peer,actor,expense)]);expect(ids[0]).toBe(ids[1]);
    const original=await db.$queryRaw`SELECT * FROM finance_expenses WHERE id=${ids[0]}`;
    await expect(recordExpense(db,actor,{...expense,netMinor:20000})).rejects.toThrow('finance_idempotency_conflict');
    const reversal=await reverseExpense(db,actor,ids[0],'Duplicate expense corrected',at);
    expect(await reverseExpense(peer,actor,ids[0],'Duplicate expense corrected',at)).toBe(reversal);
    expect(await db.$queryRaw`SELECT * FROM finance_expenses WHERE id=${ids[0]}`).toEqual(original);
    const rows=await db.$queryRaw<{total_minor:bigint;paid_minor:bigint;reversal_of:bigint|null}[]>`SELECT total_minor,paid_minor,reversal_of FROM finance_expenses`;
    expect(rows).toHaveLength(2);expect(rows.reduce((sum,row)=>sum+row.total_minor*(row.reversal_of?-1n:1n),0n)).toBe(0n);
    expect(rows.reduce((sum,row)=>sum+row.paid_minor*(row.reversal_of?-1n:1n),0n)).toBe(0n);
    await expect(reverseExpense(db,actor,reversal,'Nested reversal',at)).rejects.toThrow('finance_reversal_invalid');
  });
  it('closes a reconciled empty month and rejects later expense, budget, receipt and accrual writes into it',async()=>{
    await closeMonth(db,actor,'2026-08',[...CLOSE_CHECKS],'Fixture month fully reviewed',later);
    const before=await db.$queryRaw`SELECT * FROM finance_periods WHERE month='2026-08'`;
    await expect(recordExpense(db,actor,expense)).rejects.toThrow('finance_period_closed');
    await expect(saveBudget(db,actor,{month:'2026-08',category:'hosting',plannedMinor:500,reason:'Synthetic closed budget'})).rejects.toThrow('finance_period_closed');
    await seedOrder();await expect(captureInvoices(db,actor)).rejects.toThrow('finance_period_closed');
    await expect(release()).rejects.toThrow('finance_period_closed');
    expect(await db.$queryRaw`SELECT * FROM finance_periods WHERE month='2026-08'`).toEqual(before);
    expect(await count('finance_expenses')).toBe(0);expect(await count('finance_budgets')).toBe(0);expect(await count('finance_invoices')).toBe(0);
    expect(await count('finance_audit')).toBe(1);
  });
  it('blocks period closure for missing checks, an unfinished month or an unreconciled paid receipt',async()=>{
    await expect(closeMonth(db,actor,'2026-08',[],'Missing checklist',later)).rejects.toThrow('finance_checklist_incomplete');
    await expect(closeMonth(db,actor,'2026-09',[...CLOSE_CHECKS],'Current month',later)).rejects.toThrow('finance_month_not_ended');
    await seedOrder();await expect(closeMonth(db,actor,'2026-08',[...CLOSE_CHECKS],'Unreconciled receipt',later)).rejects.toThrow('finance_close_blocked');
    expect(await count('finance_periods')).toBe(0);expect(await count('finance_audit')).toBe(0);
  });
  it('keeps reconciled issued documents and settlements unchanged after their period closes',async()=>{
    await seedOrder();await release();const settlement=await draft();
    await approveSettlement(db,checker,settlement,'fixture-transfer',at);
    const invoice=await capturedId();await issueInvoice(db,actor,invoice,fiscal(),gate,at);
    const expenseId=await recordExpense(db,actor,expense);
    await closeMonth(db,actor,'2026-08',[...CLOSE_CHECKS],'All fixture movements reconciled',later);
    const before=await readFinanceData(db);
    await expect(approveSettlement(db,checker,settlement,'fixture-transfer',at)).rejects.toThrow('finance_period_closed');
    await expect(reverseSettlement(db,actor,settlement,'Backdated reversal',at)).rejects.toThrow('finance_period_closed');
    await expect(reverseExpense(db,actor,expenseId,'Backdated expense reversal',at)).rejects.toThrow('finance_period_closed');
    await expect(issueInvoice(db,actor,invoice,fiscal(),gate,at)).rejects.toThrow('finance_period_closed');
    expect(await readFinanceData(db)).toEqual(before);
    // A current-period correction is allowed and preserves the closed-period original.
    await reverseExpense(db,actor,expenseId,'Correction recorded in the open period',later);
    expect((await readFinanceData(db)).expenses).toHaveLength(2);
    expect((await readFinanceData(db)).periods.find(period=>period.month==='2026-08')).toEqual(before.periods.find(period=>period.month==='2026-08'));
  });
  it('rolls back expense, its new period and audit together when the audit insert fails',async()=>{
    await failAudit(()=>recordExpense(db,actor,expense));
    expect(await count('finance_expenses')).toBe(0);expect(await count('finance_periods')).toBe(0);expect(await count('finance_audit')).toBe(0);
    await recordExpense(db,actor,expense);expect(await count('finance_expenses')).toBe(1);
  });
  it('rolls back captured invoices on audit failure and can safely replay the original receipt',async()=>{
    await seedOrder();await failAudit(()=>captureInvoices(db,actor));
    expect(await count('finance_invoices')).toBe(0);expect(await count('finance_periods')).toBe(0);expect(await count('commerce_receipts')).toBe(1);
    expect(await captureInvoices(db,actor)).toBe(1);expect(await captureInvoices(db,actor)).toBe(0);
  });
  it('rolls back invoice issuance and number allocation on audit failure',async()=>{
    await seedOrder();const id=await capturedId();const before=await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`;
    await failAudit(()=>issueInvoice(db,actor,id,fiscal(),gate,at));
    expect(await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${id}`).toEqual(before);expect(await count('finance_sequences')).toBe(0);
    expect(await issueInvoice(db,actor,id,fiscal(),gate,at)).toBe('INV-2026-00000001');
  });
  it('rolls back settlement lines, approval and reversal if their audit record cannot persist',async()=>{
    await seedOrder();await release();const auditBefore=await count('finance_audit');
    await failAudit(()=>draft());expect(await count('finance_settlements')).toBe(0);expect(await count('finance_settlement_lines')).toBe(0);expect(await count('finance_audit')).toBe(auditBefore);
    const id=await draft();await failAudit(()=>approveSettlement(db,checker,id,'fixture-transfer',at));
    expect((await db.$queryRaw<{status:string;reference:string}[]>`SELECT status,reference FROM finance_settlements WHERE id=${id}`)[0]).toEqual({status:'draft',reference:''});
    await approveSettlement(db,checker,id,'fixture-transfer',at);await failAudit(()=>reverseSettlement(db,actor,id,'Correction',at));
    expect((await db.$queryRaw<{status:string}[]>`SELECT status FROM finance_settlements WHERE id=${id}`)[0].status).toBe('approved');
    expect(await count('finance_settlements')).toBe(1);expect(await count('finance_settlement_lines')).toBe(1);
  });
  it('rolls back a period close when its audit record cannot persist',async()=>{
    await failAudit(()=>closeMonth(db,actor,'2026-08',[...CLOSE_CHECKS],'Fixture close',later));
    expect(await count('finance_periods')).toBe(0);expect(await count('finance_audit')).toBe(0);
  });
  it('requires an independent settlement checker and persists maker, checker and request audit context',async()=>{
    await seedOrder();await release();const id=await draft();
    await expect(approveSettlement(db,actor,id,'fixture-self-approval',at)).rejects.toThrow('finance_independent_checker_required');
    expect((await readFinanceData(db)).settlements[0].status).toBe('draft');
    await withFinanceAuditContext({ip:'192.0.2.71',sessionFingerprint:'a'.repeat(64)},()=>approveSettlement(db,checker,id,'fixture-independent-transfer',at));
    const data=await readFinanceData(db),audit=data.audit.find(row=>row.action==='settlement_approved');
    expect(data.settlements[0]).toMatchObject({makerId:'71',checkerId:'72',status:'approved'});
    expect(audit).toMatchObject({actorId:'72',ip:'192.0.2.71',sessionFingerprint:'a'.repeat(64),before:expect.anything(),after:expect.anything()});
    expect(audit?.payload).toMatchObject({mode:'independent_checker',makerId:'71',checkerId:'72'});
  });
  it('permits sole-approver mode only after other effective approval grants are absent',async()=>{
    await seedOrder();await release();const id=await draft();
    await db.$executeRaw`DELETE FROM access_role_permissions WHERE role_id='fixture-checker' AND permission='settlements:approve'`;
    await approveSettlement(db,actor,id,'fixture-sole-transfer',at);
    const audit=(await readFinanceData(db)).audit.find(row=>row.action==='settlement_approved');
    expect(audit?.payload).toMatchObject({mode:'sole_approver',makerId:'71',checkerId:'71'});
  });
  it('creates one reviewed return, rejects its maker and deduplicates its checker without repeating credit',async()=>{
    const invoice=await issuedOrder(),before=await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${invoice}`;
    const input=returnInput(invoice);
    const ids=await Promise.all([requestFinanceChange(db,actor,input,at),requestFinanceChange(peer,actor,input,at)]);
    expect(ids[0]).toBe(ids[1]);expect(await count('finance_change_requests')).toBe(2); // Initial policy plus this return.
    expect(await count('finance_invoices')).toBe(1);
    await expect(approveFinanceChange(db,actor,ids[0],'Maker cannot approve',at)).rejects.toThrow('finance_independent_checker_required');
    const results=await Promise.all([approveFinanceChange(db,checker,ids[0],'Independent review',at),approveFinanceChange(peer,checker,ids[0],'Independent review',at)]);
    expect(results[0]).toEqual(results[1]);expect(results[0]).toMatchObject({totalMinor:11500,vatMinor:1500,supplierMinor:7000,mode:'independent_checker',number:'CRN-2026-00000001'});
    expect(await count('finance_invoices')).toBe(2);expect(await count('finance_refunds')).toBe(0);
    expect(await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${invoice}`).toEqual(before);
    expect((await readFinanceData(db)).requests?.[0]).toMatchObject({status:'approved',makerId:'71',checkerId:'72'});
    expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) n FROM finance_audit WHERE action='change_approved'`)[0].n).toBe(1n);
  });
  it('rejects stale or excessive returns under concurrent independent approval without double credit',async()=>{
    const invoice=await issuedOrder();
    const first=await requestFinanceChange(db,actor,returnInput(invoice,'fixture-race-return-a'),at);
    const second=await requestFinanceChange(db,actor,returnInput(invoice,'fixture-race-return-b'),at);
    const results=await Promise.allSettled([approveFinanceChange(db,checker,first,'First inspection',at),approveFinanceChange(peer,checker,second,'Second inspection',at)]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    const failure=results.find(result=>result.status==='rejected');
    expect(failure?.status==='rejected'?String(failure.reason):'').toContain('finance_note_exceeds_original');
    expect(await count('finance_invoices')).toBe(2);
    expect((await readFinanceData(db)).requests?.filter(row=>row.kind==='return'&&row.status==='approved')).toHaveLength(1);
    expect((await readFinanceData(db)).requests?.filter(row=>row.kind==='return'&&row.status==='pending')).toHaveLength(1);
    expect((await report('2026-08',at)).suppliers.find(row=>row.id==='1')?.remainingMinor).toBe(0);
  });
  it('checks return approval grants again after request creation and permits cancellation without deleting history',async()=>{
    const invoice=await issuedOrder(),requestId=await requestFinanceChange(db,actor,returnInput(invoice),at);
    await db.$executeRaw`DELETE FROM access_role_permissions WHERE role_id='fixture-checker' AND permission='returns:approve'`;
    await expect(approveFinanceChange(db,checker,requestId,'Revoked checker',at)).rejects.toThrow('access_forbidden');
    await expect(approveFinanceChange(db,75n,requestId,'Auditor cannot approve',at)).rejects.toThrow('access_forbidden');
    await cancelFinanceChange(db,actor,requestId,'Customer withdrew return',at);
    await cancelFinanceChange(peer,actor,requestId,'Customer withdrew return',at);
    expect((await readFinanceData(db)).requests?.[0].status).toBe('cancelled');
    await expect(approveFinanceChange(db,actor,requestId,'Cancelled request',at)).rejects.toThrow('finance_change_state');
    expect(await count('finance_invoices')).toBe(1);expect(await count('finance_refunds')).toBe(0);
    expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) n FROM finance_audit WHERE action='change_cancelled'`)[0].n).toBe(1n);
  });
  it('rolls back return request, cancellation and approval plus credit numbering if audit storage fails',async()=>{
    const invoice=await issuedOrder();
    await failAudit(()=>requestFinanceChange(db,actor,returnInput(invoice),at));expect(await count('finance_change_requests')).toBe(1); // Initial policy survives.
    const requestId=await requestFinanceChange(db,actor,returnInput(invoice),at);
    const pending=await db.$queryRaw`SELECT * FROM finance_change_requests WHERE id=${requestId}`;
    await failAudit(()=>cancelFinanceChange(db,actor,requestId,'Audit unavailable',at));
    expect(await db.$queryRaw`SELECT * FROM finance_change_requests WHERE id=${requestId}`).toEqual(pending);
    await failAudit(()=>approveFinanceChange(db,checker,requestId,'Audit unavailable',at));
    expect(await db.$queryRaw`SELECT * FROM finance_change_requests WHERE id=${requestId}`).toEqual(pending);
    expect(await count('finance_invoices')).toBe(1);expect(await db.$queryRaw`SELECT name FROM finance_sequences WHERE name='CRN-2026'`).toEqual([]);
    expect(await approveFinanceChange(db,checker,requestId,'Audit recovered',at)).toMatchObject({number:'CRN-2026-00000001'});
  });
  it('approves a future tax policy with a second actor while retaining all previously issued snapshots',async()=>{
    const invoice=await issuedOrder(),before=await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${invoice}`;
    const input={kind:'tax_settings' as const,targetId:'tax',payload:{effectiveFrom:'2026-10-01',issuer:fiscal().issuer,vatBps:500,policyReference:'fixture-future-tax'},reason:'Future fixture policy approved offline',requestKey:'fixture-tax-01'};
    await expect(requestFinanceChange(db,73n,input,at)).rejects.toThrow('access_forbidden');
    const id=await requestFinanceChange(db,actor,input,at);
    expect(await count('finance_tax_policies')).toBe(1);
    await expect(approveFinanceChange(db,actor,id,'Maker rejected',at)).rejects.toThrow('finance_independent_checker_required');
    await failAudit(()=>approveFinanceChange(db,checker,id,'Audit unavailable',at));expect(await count('finance_tax_policies')).toBe(1);
    const result=await approveFinanceChange(db,checker,id,'Policy reviewed',at);
    expect(result?.policyId).toMatch(/^\d+$/);expect(await count('finance_tax_policies')).toBe(2);
    expect(await approveFinanceChange(peer,checker,id,'Policy reviewed',at)).toEqual(result);
    expect((await readFinanceData(db)).taxPolicies?.find(policy=>policy.policyReference==='fixture-future-tax')).toMatchObject({effectiveFrom:'2026-10-01',vatBps:500,policyReference:'fixture-future-tax'});
    expect(await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${invoice}`).toEqual(before);
  });
  it('reopens an exact closed-period version only with a second approver and rejects stale requests',async()=>{
    await closeMonth(db,actor,'2026-08',[...CLOSE_CHECKS],'Reviewed fixture month',later);
    const [closed]=await db.$queryRaw<{version:number}[]>`SELECT version FROM finance_periods WHERE month='2026-08'`;
    const input={kind:'reopen_period' as const,targetId:'2026-08',payload:{expectedVersion:closed.version},reason:'Reopen for documented correction',requestKey:'fixture-reopen-01'};
    const id=await requestFinanceChange(db,actor,input,later);
    const stale=await requestFinanceChange(db,actor,{...input,requestKey:'fixture-reopen-stale'},later);
    const before=await db.$queryRaw`SELECT * FROM finance_periods WHERE month='2026-08'`;
    await expect(approveFinanceChange(db,actor,id,'Maker cannot reopen',later)).rejects.toThrow('finance_independent_checker_required');
    await failAudit(()=>approveFinanceChange(db,checker,id,'Audit unavailable',later));
    expect(await db.$queryRaw`SELECT * FROM finance_periods WHERE month='2026-08'`).toEqual(before);
    await withFinanceAuditContext({ip:'192.0.2.72',sessionFingerprint:'b'.repeat(64)},()=>approveFinanceChange(db,checker,id,'Second review completed',later));
    await expect(approveFinanceChange(db,checker,stale,'Stale review',later)).rejects.toThrow('finance_period_version_conflict');
    const data=await readFinanceData(db);
    expect(data.periods[0]).toMatchObject({month:'2026-08',closedAt:null,version:closed.version+1});
    expect(data.audit.find(row=>row.action==='month_reopened')).toMatchObject({actorId:'72',ip:'192.0.2.72',sessionFingerprint:'b'.repeat(64),before:expect.anything(),after:expect.anything()});
    await recordExpense(db,actor,expense);expect(await count('finance_expenses')).toBe(1);
  });
  it('cancels only settlement and invoice drafts, retains their records and never reuses issued numbers',async()=>{
    await seedOrder();await release();const settlement=await draft(),invoice=await capturedId();
    await expect(cancelSettlement(db,75n,settlement,'Auditor cannot cancel',at)).rejects.toThrow('access_forbidden');
    await failAudit(()=>cancelSettlement(db,actor,settlement,'Audit unavailable',at));
    expect((await readFinanceData(db)).settlements[0].status).toBe('draft');
    await cancelSettlement(db,actor,settlement,'Draft superseded',at);
    await expect(approveSettlement(db,checker,settlement,'Cancelled settlement',at)).rejects.toThrow('finance_settlement_state');
    const replacement=await draft('fixture-draft-replacement');await approveSettlement(db,checker,replacement,'Replacement transfer',at);
    await expect(cancelSettlement(db,actor,replacement,'Issued settlement cannot cancel',at)).rejects.toThrow(/finance_/);
    await failAudit(()=>cancelDraftInvoice(db,actor,invoice,'Audit unavailable',at));
    expect((await readFinanceData(db)).invoices[0].status).toBe('pending_policy');
    await cancelDraftInvoice(db,actor,invoice,'Duplicate fixture draft',at);
    expect(await captureInvoices(db,actor)).toBe(0);
    await expect(issueInvoice(db,actor,invoice,fiscal(),gate,at)).rejects.toThrow(/finance_/);
    expect(await count('finance_sequences')).toBe(0);
    expect((await readFinanceData(db)).invoices[0].status).toBe('cancelled');
    await seedOrder(2n);const issued=await capturedId(2n);await issueInvoice(db,actor,issued,fiscal(2n),gate,at);
    await expect(cancelDraftInvoice(db,actor,issued,'Issued invoice cannot cancel',at)).rejects.toThrow(/finance_/);
    expect((await db.$queryRaw<{number:string}[]>`SELECT number FROM finance_invoices WHERE id=${issued}`)[0].number).toBe('INV-2026-00000001');
  });
  it('records an immutable reconciliation only for a resolved open period and rolls back with its audit',async()=>{
    const input={month:'2026-08',reason:'Synthetic source-by-source review',requestKey:'fixture-reconcile-01'};
    await seedOrder();
    await expect(recordFinanceReconciliation(db,73n,input,at)).rejects.toThrow('access_forbidden');
    await expect(recordFinanceReconciliation(db,75n,input,at)).rejects.toThrow('access_forbidden');
    await expect(recordFinanceReconciliation(db,actor,input,at)).rejects.toThrow('finance_reconciliation_unresolved');
    expect(await count('finance_reconciliations')).toBe(0);
    const invoice=await capturedId();await issueInvoice(db,actor,invoice,fiscal(),gate,at);
    expect((await report('2026-08',at)).issues.filter(issue=>issue.severity==='error').map(issue=>issue.key)).toEqual(['eligibility:1']);
    await expect(recordFinanceReconciliation(db,actor,input,at)).rejects.toThrow('finance_reconciliation_unresolved');
    await release();
    expect((await report('2026-08',at)).issues.filter(issue=>issue.severity==='error')).toEqual([]);
    await failAudit(()=>recordFinanceReconciliation(db,actor,input,at));expect(await count('finance_reconciliations')).toBe(0);
    const id=await recordFinanceReconciliation(db,actor,input,at);
    const before=await db.$queryRaw`SELECT * FROM finance_reconciliations WHERE id=${id}`;
    expect(await recordFinanceReconciliation(peer,actor,input,at)).toBe(id);
    await expect(recordFinanceReconciliation(db,actor,{...input,reason:'Different review'},at)).rejects.toThrow('finance_idempotency_conflict');
    await recordExpense(db,actor,expense);
    expect(await db.$queryRaw`SELECT * FROM finance_reconciliations WHERE id=${id}`).toEqual(before);
    await closeMonth(db,actor,'2026-08',[...CLOSE_CHECKS],'Fixture complete sources reviewed',later);
    await expect(recordFinanceReconciliation(db,actor,{...input,requestKey:'fixture-reconcile-closed'},later)).rejects.toThrow('finance_period_closed');
    expect(await count('finance_reconciliations')).toBe(1);
  });
  it('restores a cancelled paid-receipt draft only with both sensitive grants and keeps its original source',async()=>{
    await seedOrder();const invoice=await capturedId();
    const source=await db.$queryRaw`SELECT id,source_key,source_snapshot,created_at,total_minor FROM finance_invoices WHERE id=${invoice}`;
    await cancelDraftInvoice(db,actor,invoice,'Cancelled before fiscal review',at);
    expect(await captureInvoices(db,actor)).toBe(0);
    await expect(restoreDraftInvoice(db,74n,invoice,'Accountant lacks cancellation grant',at)).rejects.toThrow('access_forbidden');
    await db.$executeRaw`DELETE FROM access_role_permissions WHERE role_id='fixture-checker' AND permission='invoices:create'`;
    await expect(restoreDraftInvoice(db,checker,invoice,'Checker lacks creation grant',at)).rejects.toThrow('access_forbidden');
    const cancelled=await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${invoice}`;
    await failAudit(()=>restoreDraftInvoice(db,actor,invoice,'Audit unavailable',at));
    expect(await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${invoice}`).toEqual(cancelled);
    await db.$executeRaw`UPDATE commerce_orders SET shipping='{"name":"Changed after capture"}' WHERE id=1`;
    await db.$executeRaw`UPDATE commerce_order_items SET title='Changed after capture' WHERE order_id=1`;
    await restoreDraftInvoice(db,actor,invoice,'Original source reviewed for reissue',at);
    expect(await db.$queryRaw`SELECT id,source_key,source_snapshot,created_at,total_minor FROM finance_invoices WHERE id=${invoice}`).toEqual(source);
    expect((await readFinanceData(db)).invoices[0]).toMatchObject({id:String(invoice),status:'pending_policy',number:null});
    expect(await count('finance_invoices')).toBe(1);expect(await count('finance_sequences')).toBe(0);
    await expect(restoreDraftInvoice(db,actor,invoice,'Already pending',at)).rejects.toThrow('finance_invoice_state');
    expect(await issueInvoice(db,actor,invoice,fiscal(),gate,at)).toBe('INV-2026-00000001');
    await expect(restoreDraftInvoice(db,actor,invoice,'Never restore issued document',at)).rejects.toThrow('finance_invoice_state');
  });
  it('refuses restoration into a closed accounting period without changing the cancelled draft',async()=>{
    await seedOrder();const invoice=await capturedId();await cancelDraftInvoice(db,actor,invoice,'Cancelled fixture',at);
    // Historical restored-period fixture: normal closure refuses missing fiscal policy.
    await db.$executeRaw`UPDATE finance_periods SET closed_at=${later},version=1 WHERE month='2026-08'`;
    const before=await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${invoice}`;
    await expect(restoreDraftInvoice(db,actor,invoice,'Closed source must reopen first',later)).rejects.toThrow('finance_period_closed');
    expect(await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${invoice}`).toEqual(before);expect(await count('finance_sequences')).toBe(0);
  });
  it('runs synthetic checkout, receipt, invoice, tracking, settlement, close and partial then full return through actual local services',async()=>{
    // No gateway, supplier or carrier is contacted. This trap fails the fixture if
    // an unintended network adapter is introduced into a supposedly local service.
    const network=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>{throw new Error('External network forbidden in finance fixture');});
    try{
      expect(process.env.SUPPLIER_ALLOW_LIVE_ORDERS).toBe('false');
      expect((await db.$queryRaw<{name:string}[]>`SELECT DATABASE() AS name`)[0].name).toBe('trbhh_finance_test');
      // Only this newly created loopback fixture enables its local checkout gate.
      await db.$executeRaw`INSERT INTO site_settings(k,v) VALUES('commerce_purchasing_enabled','1')`;
      await db.$executeRaw`UPDATE commerce_suppliers SET active=1 WHERE id=1`;
      await db.$executeRaw`INSERT INTO commerce_products(id,title,price_minor,stock_available,approved,visible,enabled) VALUES(1,'Synthetic original product',11500,5,1,1,1)`;
      await db.$executeRaw`INSERT INTO commerce_product_suppliers(product_id,supplier_id,supplier_sku,unit_cost_minor) VALUES(1,1,'FIXTURE-SKU',7000)`;
      const shipping={name:'Synthetic customer',phone:'+966500000000',addressLine:'Synthetic fixture address',city:'Riyadh',postalCode:'12345',country:'SA' as const};
      const orderInput={memberId:5n,requestKey:'fixture-actual-checkout-01',items:[{productId:1n,quantity:2}],shipping};
      const order=await createOrder(db,orderInput,{shippingFeeMinor:0});
      expect(await createOrder(peer,orderInput,{shippingFeeMinor:0})).toEqual(order);
      expect(order).toMatchObject({status:'awaiting_payment',totalMinor:23000,items:[{quantity:2,unitPriceMinor:11500}]});
      expect((await db.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`)[0]).toEqual({stock_available:3,stock_reserved:2});
      const claim=await claimPaymentAttempt(db,{memberId:5n,orderId:order.id,provider:'fixture'});
      if(!claim.claimed)throw new Error('Synthetic fixture must own its payment claim');
      await recordPaymentReference(db,{attemptId:claim.attempt.id,claimToken:claim.claimToken,reference:'fixture-verified-payment'});
      const evidence={provider:'fixture',reference:'fixture-verified-payment',merchantOrderId:claim.attempt.merchantOrderId,amountMinor:23000,currency:'SAR',verified:true,status:'paid'};
      expect(await settleVerifiedPayment(db,evidence,[])).toEqual({orderId:order.id,alreadyPaid:false});
      expect(await settleVerifiedPayment(peer,evidence,[])).toEqual({orderId:order.id,alreadyPaid:true});
      expect(await count('commerce_receipts')).toBe(1);expect(await count('commerce_supplier_accruals')).toBe(1);
      expect((await db.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`)[0]).toEqual({stock_available:3,stock_reserved:0});
      const [receipt]=await db.$queryRaw<{id:bigint;recorded_at:Date}[]>`SELECT id,recorded_at FROM commerce_receipts WHERE order_id=${order.id}`;
      const [accrual]=await db.$queryRaw<{id:bigint;amount_minor:number}[]>`SELECT id,amount_minor FROM commerce_supplier_accruals WHERE order_id=${order.id}`;
      expect(accrual.amount_minor).toBe(14000);
      const clock=new Date(Math.max(Date.now(),receipt.recorded_at.getTime())+1000),month=financeMonth(clock);
      const today=new Date(clock.getTime()+10800000).toISOString().slice(0,10);
      const [year,monthNumber]=month.split('-').map(Number),nextMonth=new Date(Date.UTC(year,monthNumber,2,12));
      const invoice=await capturedId(order.id);
      const snapshot:FiscalSnapshot={...fiscal(),...calculateFiscalLines([{key:'1',title:'Synthetic original product',quantity:2,unitNetMinor:10000,discountMinor:0,vatBps:1500,supplierId:'1',supplierMinor:14000}]),paidMinor:23000,sourceOrderId:String(order.id),sourceReceiptId:String(receipt.id)};
      await issueInvoice(db,actor,invoice,snapshot,gate,clock);
      // Existing imported-outbox fixture, not a carrier dispatch or supplier API.
      await db.$executeRaw`INSERT INTO supplier_integration_profiles(supplier_id,provider,mode) VALUES(1,'salla','development')`;
      await db.$executeRaw`INSERT INTO supplier_connections(id,supplier_id,provider,external_store_id,status) VALUES(1,1,'salla','fixture-store','connected')`;
      await db.$executeRaw`INSERT INTO supplier_orders(order_id,connection_id,supplier_id,external_order_id,idempotency_key,status,selling_minor,payable_minor,profit_minor,payment_status,request_snapshot) VALUES(${order.id},1,1,'90001','fixture-imported-outbox','simulated',23000,14000,9000,'paid','{}')`;
      const observation={externalId:'90001',status:'shipped',paymentStatus:'paid',currency:'SAR' as const,payableMinor:14000,sourceUpdatedAt:clock.toISOString(),shipments:[{externalId:'fixture-shipment',carrier:'Synthetic carrier',trackingNumber:'FIXTURE-TRACKING',status:'delivered',fulfillmentStatus:'fulfilled',sourceUpdatedAt:clock.toISOString()}]};
      await recordSupplierTracking(db,1n,observation);await recordSupplierTracking(peer,1n,observation);
      expect(await memberOrderTracking(db,order.id,5n)).toMatchObject([{carrier:'Synthetic carrier',trackingNumber:'FIXTURE-TRACKING',status:'delivered'}]);
      expect(await memberOrderTracking(db,order.id,73n)).toEqual([]);
      expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) n FROM supplier_shipments`)[0].n).toBe(1n);
      expect((await db.$queryRaw<{status:string;payment_status:string}[]>`SELECT status,payment_status FROM supplier_orders WHERE order_id=${order.id}`)[0]).toEqual({status:'simulated',payment_status:'paid'});
      expect(await db.$queryRaw<{channel:string}[]>`SELECT DISTINCT channel FROM commerce_notifications WHERE order_id=${order.id}`).toEqual([{channel:'in_app'}]);
      expect((await db.$queryRaw<{auto_orders_enabled:number;sync_enabled:number;mode:string}[]>`SELECT auto_orders_enabled,sync_enabled,mode FROM supplier_integration_profiles WHERE supplier_id=1`)[0]).toEqual({auto_orders_enabled:0,sync_enabled:0,mode:'development'});
      await releaseAccrual(db,actor,accrual.id,today,'Synthetic delivery reviewed',clock);
      const settlement=await prepareSettlement(db,actor,{supplierId:1n,accrualIds:[accrual.id],requestKey:'fixture-full-lifecycle-payout',reason:'Verified fixture payout'},clock);
      await approveSettlement(db,checker,settlement,'fixture-offline-transfer',clock);
      const before=await report(month,clock);
      expect(before.suppliers.find(supplier=>supplier.id==='1')).toMatchObject({accruedMinor:14000,paidMinor:14000,remainingMinor:0});
      expect(before.issues.filter(issue=>issue.severity==='error')).toEqual([]);
      await recordFinanceReconciliation(db,actor,{month,reason:'Full synthetic sources reconciled',requestKey:'fixture-full-reconciliation'},clock);
      await closeMonth(db,actor,month,[...CLOSE_CHECKS],'Synthetic month ended and reviewed',nextMonth);
      const closedPeriod=await db.$queryRaw`SELECT * FROM finance_periods WHERE month=${month}`;
      const closedInvoice=await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${invoice}`;
      const paidSettlement=await db.$queryRaw`SELECT * FROM finance_settlements WHERE id=${settlement}`;
      for(let part=1;part<=2;part++){
        const input=returnInput(invoice,`fixture-lifecycle-return-${part}`);
        const requestId=await requestFinanceChange(db,actor,input,nextMonth);
        await expect(approveFinanceChange(db,actor,requestId,'Maker is not checker',nextMonth)).rejects.toThrow('finance_independent_checker_required');
        const result=await approveFinanceChange(db,checker,requestId,'Physical unit checked separately',nextMonth);
        expect(result).toMatchObject({totalMinor:11500,vatMinor:1500,supplierMinor:7000});
        await recordVerifiedFinanceRefund(db,checker,{verified:true,status:'refunded',provider:'fixture',externalId:`fixture-lifecycle-refund-${part}`,receiptId:String(receipt.id),orderId:String(order.id),amountMinor:11500,currency:'SAR',refundedAt:nextMonth.toISOString(),evidenceRef:`fixture-only-refund-evidence-${part}`},gate,nextMonth);
        const current=await report(financeMonth(nextMonth),nextMonth);
        expect(current.suppliers.find(supplier=>supplier.id==='1')?.remainingMinor).toBe(-7000*part);
        expect(current.metrics.find(metric=>metric.key==='refunds')?.valueMinor).toBe(11500*part);
        expect(current.metrics.find(metric=>metric.key==='vat')?.valueMinor).toBe(-1500*part);
      }
      await expect(requestFinanceChange(db,actor,returnInput(invoice,'fixture-lifecycle-third-return'),nextMonth)).rejects.toThrow('finance_note_exceeds_original');
      expect(await count('finance_invoices')).toBe(3);expect(await count('finance_refunds')).toBe(2);
      expect(await db.$queryRaw`SELECT * FROM finance_periods WHERE month=${month}`).toEqual(closedPeriod);
      expect(await db.$queryRaw`SELECT * FROM finance_invoices WHERE id=${invoice}`).toEqual(closedInvoice);
      expect(await db.$queryRaw`SELECT * FROM finance_settlements WHERE id=${settlement}`).toEqual(paidSettlement);
      expect((await report(month,nextMonth)).metrics.find(metric=>metric.key==='vat')?.valueMinor).toBe(3000);
      expect((await db.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`)[0]).toEqual({stock_available:3,stock_reserved:0});
      expect(network).not.toHaveBeenCalled();
    }finally{network.mockRestore();}
  },60000);
});
