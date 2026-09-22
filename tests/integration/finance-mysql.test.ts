import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {COMMERCE_DDL} from '@/lib/commerce/schema';
import {FINANCE_DDL,FINANCE_TABLES,assertFinanceSchemaReady} from '@/lib/finance/schema';
import {approveSettlement,captureInvoices,closeMonth,CLOSE_CHECKS,issueInvoice,prepareSettlement,recordExpense,releaseAccrual,reverseExpense,reverseSettlement,saveBudget,type ExpenseInput} from '@/lib/finance/service';
import {calculateFiscalLines} from '@/lib/finance/calculations';
import {issueAdjustment,recordVerifiedFinanceRefund,type VerifiedFinanceRefund} from '@/lib/finance/adjustments';
import {readFinanceData,financeJson} from '@/lib/finance/read-model';
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
const at=new Date('2026-08-15T12:00:00.000Z');
const later=new Date('2026-09-15T12:00:00.000Z');
const gate={enabled:true,approvedPolicyReference:'fixture-approved-policy-v1'};
const expense:ExpenseInput={category:'hosting',description:'Synthetic hosting expense',netMinor:10000,vatMinor:1500,paidMinor:11500,occurredAt:'2026-08-15',dueAt:'2026-08-15',reference:'fixture-expense-ref',requestKey:'fixture-expense-01'};
const cleanupTables=[
  'finance_audit','finance_refunds','finance_settlement_lines','finance_settlements','finance_accrual_reviews',
  'finance_invoices','finance_sequences','finance_expenses','finance_budgets','finance_periods',
  'commerce_supplier_accruals','commerce_receipts','commerce_order_suppliers','commerce_product_suppliers',
  'commerce_notifications','commerce_audit_events','commerce_payment_attempts','commerce_order_items',
  'commerce_orders','commerce_products','commerce_suppliers',
];
let db:PrismaClient,peer:PrismaClient,admin:PrismaClient,created=false;

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
async function failAudit(run:()=>Promise<unknown>) {
  // A real storage failure, after preceding writes in the same transaction.
  await db.$executeRawUnsafe("CREATE TRIGGER finance_fixture_reject_audit BEFORE INSERT ON finance_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture_audit_unavailable'");
  try {await expect(run()).rejects.toThrow('fixture_audit_unavailable');}
  finally {await db.$executeRawUnsafe('DROP TRIGGER finance_fixture_reject_audit');}
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
    for(const ddl of [...COMMERCE_DDL,...FINANCE_DDL])await db.$executeRawUnsafe(ddl);
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
    for(const table of cleanupTables)await db.$executeRawUnsafe(`DELETE FROM ${table}`);
    await db.$executeRaw`INSERT INTO commerce_suppliers(id,name) VALUES(1,'Synthetic supplier'),(2,'Other synthetic supplier')`;
  });

  it('owns a newly created database and refuses to replace an existing one',async()=>{
    await expect(admin.$executeRawUnsafe('CREATE DATABASE trbhh_finance_test')).rejects.toThrow();
    expect(await count('commerce_suppliers')).toBe(2);
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
  it('rejects a supplier credit after that supplier has already been paid',async()=>{
    await seedOrder();await release();const settlement=await draft();await approveSettlement(db,actor,settlement,'fixture-transfer',at);
    const id=await capturedId();await issueInvoice(db,actor,id,fiscal(),gate,at);
    await expect(issueAdjustment(db,actor,{originalId:id,kind:'credit_note',requestKey:'fixture-credit-paid-supplier',reason:'Supplier already paid',snapshot:fiscal()},gate,at)).rejects.toThrow('finance_note_supplier_already_paid');
    expect(await count('finance_invoices')).toBe(1);
    expect(await db.$queryRaw`SELECT name FROM finance_sequences WHERE name='CRN-2026'`).toEqual([]);
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
    const results=await Promise.allSettled([approveSettlement(db,actor,first,'transfer-a',at),approveSettlement(peer,actor,second,'transfer-b',at)]);
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
    await approveSettlement(db,actor,id,'fixture-transfer',at);await approveSettlement(peer,actor,id,'fixture-transfer',at);
    await expect(approveSettlement(db,actor,id,'different-transfer',at)).rejects.toThrow('finance_idempotency_conflict');
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
    await seedOrder();await release();const original=await draft();await approveSettlement(db,actor,original,'fixture-transfer',at);
    const before=(await db.$queryRaw<{amount_minor:bigint;reference:string}[]>`SELECT amount_minor,reference FROM finance_settlements WHERE id=${original}`)[0];
    const reversals=await Promise.all([reverseSettlement(db,actor,original,'Transfer corrected',at),reverseSettlement(peer,actor,original,'Transfer corrected',at)]);
    expect(reversals[0]).toBe(reversals[1]);
    expect((await db.$queryRaw<{amount_minor:bigint;reference:string}[]>`SELECT amount_minor,reference FROM finance_settlements WHERE id=${original}`)[0]).toEqual(before);
    expect((await db.$queryRaw<{status:string}[]>`SELECT status FROM finance_settlements WHERE id=${original}`)[0].status).toBe('reversed');
    expect(await count('finance_settlements')).toBe(2);expect(await count('finance_settlement_lines')).toBe(2);
    await expect(reverseSettlement(db,actor,reversals[0],'Cannot reverse a reversal',at)).rejects.toThrow('finance_reversal_invalid');
    const replacement=await draft('fixture-after-reversal');await approveSettlement(db,actor,replacement,'replacement-transfer',at);
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
    await expect(saveBudget(db,actor,{month:'2026-08',category:'hosting',plannedMinor:500})).rejects.toThrow('finance_period_closed');
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
    await approveSettlement(db,actor,settlement,'fixture-transfer',at);
    const invoice=await capturedId();await issueInvoice(db,actor,invoice,fiscal(),gate,at);
    const expenseId=await recordExpense(db,actor,expense);
    await closeMonth(db,actor,'2026-08',[...CLOSE_CHECKS],'All fixture movements reconciled',later);
    const before=await readFinanceData(db);
    await expect(approveSettlement(db,actor,settlement,'fixture-transfer',at)).rejects.toThrow('finance_period_closed');
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
    const id=await draft();await failAudit(()=>approveSettlement(db,actor,id,'fixture-transfer',at));
    expect((await db.$queryRaw<{status:string;reference:string}[]>`SELECT status,reference FROM finance_settlements WHERE id=${id}`)[0]).toEqual({status:'draft',reference:''});
    await approveSettlement(db,actor,id,'fixture-transfer',at);await failAudit(()=>reverseSettlement(db,actor,id,'Correction',at));
    expect((await db.$queryRaw<{status:string}[]>`SELECT status FROM finance_settlements WHERE id=${id}`)[0].status).toBe('approved');
    expect(await count('finance_settlements')).toBe(1);expect(await count('finance_settlement_lines')).toBe(1);
  });
  it('rolls back a period close when its audit record cannot persist',async()=>{
    await failAudit(()=>closeMonth(db,actor,'2026-08',[...CLOSE_CHECKS],'Fixture close',later));
    expect(await count('finance_periods')).toBe(0);expect(await count('finance_audit')).toBe(0);
  });
});
