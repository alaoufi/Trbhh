import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {execFileSync} from 'node:child_process';
import {COMMERCE_DDL, assertCommerceSchemaReady} from '@/lib/commerce/schema';
import {SUPPLIER_DDL} from '@/lib/suppliers/schema';
import {FINANCE_DDL} from '@/lib/finance/schema';
import type {FiscalCalculationPolicy,OrderFiscalSnapshot} from '@/lib/finance/types';
import {createOrder, claimPaymentAttempt, recordPaymentReference, markPaymentUncertain, settleVerifiedPayment, cancelUnstartedOrder} from '@/lib/commerce/orders';
import {dispatchPaidNotification} from '@/lib/commerce/notifications';
import {commerceConfigFromRows} from '@/lib/commerce/config';
import {updateCommerceProduct} from '@/lib/commerce/products';

const enabled=process.env.COMMERCE_DB_TESTS==='1';
const supplierForeignKeys = [
  ['commerce_product_suppliers','product_id','commerce_products','id','commerce_product_supplier_product_fk'],
  ['commerce_product_suppliers','supplier_id','commerce_suppliers','id','commerce_product_supplier_supplier_fk'],
  ['commerce_order_suppliers','order_id,product_id','commerce_order_items','order_id,product_id','commerce_order_supplier_item_fk'],
  ['commerce_order_suppliers','supplier_id','commerce_suppliers','id','commerce_order_supplier_supplier_fk'],
  ['commerce_receipts','order_id','commerce_orders','id','commerce_receipt_order_fk'],
  ['commerce_supplier_accruals','order_id,product_id','commerce_order_suppliers','order_id,product_id','commerce_accrual_snapshot_fk'],
  ['commerce_supplier_accruals','supplier_id','commerce_suppliers','id','commerce_accrual_supplier_fk'],
] as const;
it('Prisma migrate diff emits all seven supplier FKs matching additive DDL',()=>{
  // Schema-to-empty diff is offline: never introspect or apply against any database.
  const sql=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{
    encoding:'utf8',timeout:20000,env:{...process.env,DATABASE_URL:'mysql://fixture:fixture@127.0.0.1:33309/trbhh_commerce_test'},
  });
  for(const [table,columns,parent,refs,name] of supplierForeignKeys) {
    const quoted=(value:string)=>value.split(',').map(c=>'`'+c+'`').join(', ');
    expect(sql).toContain('ALTER TABLE `'+table+'` ADD CONSTRAINT `'+name+'` FOREIGN KEY ('+quoted(columns)+') REFERENCES `'+parent+'`('+quoted(refs)+') ON DELETE RESTRICT ON UPDATE RESTRICT;');
    expect(COMMERCE_DDL.find(ddl=>ddl.startsWith('CREATE TABLE IF NOT EXISTS '+table+' ('))).toContain('CONSTRAINT '+name+' FOREIGN KEY ('+columns+') REFERENCES '+parent+'('+refs+')');
  }
});
const raw=process.env.COMMERCE_TEST_DATABASE_URL;
let client:PrismaClient, admin:PrismaClient, created=false;
const shipping={name:'Fixture Member',phone:'+966500000000',addressLine:'Fixture street 1',city:'Riyadh',postalCode:'12345',country:'SA' as const};
const input=(requestKey='fixture-request-0001',quantity=2,memberId=1n)=>({memberId,requestKey,items:[{productId:1n,quantity}],shipping});
const policy={shippingFeeMinor:125};
const targets=[{recipient:'member:1',channel:'in_app' as const},{recipient:'+966500000000',channel:'sms' as const},{recipient:'+966500000000',channel:'whatsapp' as const}];
const count=async(table:string)=>Number((await client.$queryRawUnsafe<{n:bigint}[]>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);
const syntheticCalculation:FiscalCalculationPolicy={version:2,priceBasis:'inclusive',itemScope:'uniform_catalog',shippingPriceBasis:'inclusive',shippingVatBps:0,discountTreatment:'none',rounding:'line_half_up',policyRollover:'hold_for_review',automationDelegateId:'42'};
/** Disposable, explicitly approved zero-rate fixture; never a production policy/default. */
async function approvedFiscalPolicy(options:{reference?:string;effectiveFrom?:string;vatBps?:number;calculationPolicy?:FiscalCalculationPolicy|null}={}) {
  const reference=options.reference??'synthetic-commerce-zero-rate',effectiveFrom=options.effectiveFrom??'2020-01-01';
  const calculationPolicy=options.calculationPolicy===undefined?syntheticCalculation:options.calculationPolicy;
  const payload={effectiveFrom,issuer:{name:'Synthetic commerce issuer',taxNumber:'300000000000003',address:'Synthetic issuer address'},vatBps:options.vatBps??0,policyReference:reference,calculationPolicy};
  const approvedAt=new Date('2019-12-01T00:00:00Z');
  await client.$executeRaw`INSERT INTO finance_change_requests(request_key,fingerprint,kind,target_id,payload,status,maker_id,checker_id,reason,approval_reason,created_at,decided_at) VALUES(${reference},${'a'.repeat(64)},'tax_settings','tax',${JSON.stringify(payload)},'approved',41,42,'Synthetic policy fixture','Synthetic independent approval',${approvedAt},${approvedAt})`;
  const [request]=await client.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_change_requests WHERE request_key=${reference}`;
  await client.$executeRaw`INSERT INTO finance_tax_policies(request_id,effective_from,issuer,vat_bps,policy_reference,created_at,calculation_policy) VALUES(${request.id},${effectiveFrom},${JSON.stringify(payload.issuer)},${payload.vatBps},${reference},${approvedAt},${calculationPolicy===null?null:JSON.stringify(calculationPolicy)})`;
  const [row]=await client.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_tax_policies WHERE request_id=${request.id}`;
  return {id:row.id,requestId:request.id,payload};
}
async function storedFiscalSnapshot(orderId:bigint) {
  const [row]=await client.$queryRaw<{order_id:bigint;policy_id:bigint;request_id:bigint;captured_at:Date;fingerprint:string;snapshot:OrderFiscalSnapshot|string}[]>`SELECT order_id,policy_id,request_id,captured_at,fingerprint,snapshot FROM finance_order_fiscal_snapshots WHERE order_id=${orderId}`;
  return {...row,snapshot:typeof row.snapshot==='string'?JSON.parse(row.snapshot) as OrderFiscalSnapshot:row.snapshot};
}
async function prepared(key='fixture-request-0001') {
  const order=await createOrder(client,input(key),policy);
  const claim=await claimPaymentAttempt(client,{memberId:1n,orderId:order.id,provider:'fixture'});
  if(!claim.claimed) throw new Error('Expected a creation claim');
  await recordPaymentReference(client,{attemptId:claim.attempt.id,claimToken:claim.claimToken,reference:'ref-'+key});
  return {order,claim,evidence:{verified:true as const,status:'paid' as const,provider:'fixture',reference:'ref-'+key,merchantOrderId:claim.attempt.merchantOrderId,amountMinor:order.totalMinor,currency:'SAR'}};
}
describe.skipIf(!enabled)('commerce isolated MySQL transactions',()=>{
  beforeAll(async()=>{
    const url=new URL(raw||'');
    if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||url.port!=='33309'||url.pathname!=='/trbhh_commerce_test'||url.search||url.hash||url.username!=='root'||!url.password) throw new Error('Refusing non-isolated commerce DB');
    client=new PrismaClient({datasourceUrl:url.href,log:[]});
    url.pathname='/mysql';admin=new PrismaClient({datasourceUrl:url.href,log:[]});
    // Never overwrite/reuse an existing database. Cleanup only after this succeeds.
    await admin.$executeRawUnsafe('CREATE DATABASE trbhh_commerce_test');created=true;
    expect((await client.$queryRaw<{name:string}[]>`SELECT DATABASE() AS name`)[0].name).toBe('trbhh_commerce_test');
    await client.$executeRawUnsafe('CREATE TABLE site_settings (k VARCHAR(60) NOT NULL PRIMARY KEY,v TEXT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');
    for(const ddl of COMMERCE_DDL) await client.$executeRawUnsafe(ddl);
    for(const ddl of SUPPLIER_DDL) await client.$executeRawUnsafe(ddl);
    for(const ddl of FINANCE_DDL) await client.$executeRawUnsafe(ddl);
    await assertCommerceSchemaReady(client);
  });
  afterAll(async()=>{
    await client?.$disconnect();
    try {if(created) await admin.$executeRawUnsafe('DROP DATABASE trbhh_commerce_test');}
    finally {await admin?.$disconnect();}
  });
  beforeEach(async()=>{
    for(const table of ['finance_order_fiscal_snapshots','finance_tax_policies','finance_change_requests','commerce_supplier_accruals','commerce_receipts','commerce_order_suppliers','commerce_product_suppliers','commerce_suppliers','commerce_notifications','commerce_audit_events','commerce_payment_attempts','commerce_order_items','commerce_orders','commerce_products']) await client.$executeRawUnsafe(`DELETE FROM ${table}`);
    await client.$executeRaw`INSERT INTO commerce_products (id,title,price_minor,stock_available,stock_reserved,approved,visible,enabled) VALUES (1,'Fixture product',1025,10,0,1,1,1),(2,'Second product',200,0,0,1,1,1)`;
    // The service's purchasing gate is exercised against this newly-created
    // disposable loopback database, never bypassed or changed in production.
    await client.$executeRaw`DELETE FROM site_settings`;
    await client.$executeRaw`INSERT INTO site_settings(k,v) VALUES('commerce_purchasing_enabled','1')`;
    await approvedFiscalPolicy();
  });
  it.each(['missing','0','false','true'])('fails closed for purchasing gate %s before writing or reserving stock',async flag=>{
    await client.$executeRaw`DELETE FROM site_settings WHERE k='commerce_purchasing_enabled'`;
    if(flag!=='missing')await client.$executeRaw`INSERT INTO site_settings(k,v) VALUES('commerce_purchasing_enabled',${flag})`;
    await expect(createOrder(client,input(),policy)).rejects.toThrow('purchasing_disabled');
    expect(await count('commerce_orders')).toBe(0);
    expect((await client.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`)[0]).toEqual({stock_available:10,stock_reserved:0});
  });
  it('atomically reserves once for concurrent identical request keys and snapshots server totals',async()=>{
    const orders=await Promise.all([createOrder(client,input(),policy),createOrder(client,input(),policy)]);
    expect(orders[0].id).toBe(orders[1].id);expect(orders[0].totalMinor).toBe(2175);
    expect(orders[0].shipping).toEqual(shipping);
    const [p]=await client.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`;
    expect(p).toEqual({stock_available:8,stock_reserved:2});expect(await count('commerce_orders')).toBe(1);
    expect(await count('finance_order_fiscal_snapshots')).toBe(1);
  });
  it.each(['missing','latest_incomplete','unapproved','approval_mismatch'])('rolls back an order with %s fiscal policy without falling back to defaults',async state=>{
    if(state==='missing')await client.$executeRaw`DELETE FROM finance_tax_policies`;
    if(state==='latest_incomplete')await approvedFiscalPolicy({reference:'synthetic-incomplete-policy',effectiveFrom:'2020-01-02',calculationPolicy:null});
    if(state==='unapproved')await client.$executeRaw`UPDATE finance_change_requests SET status='pending'`;
    if(state==='approval_mismatch')await client.$executeRaw`UPDATE finance_tax_policies SET vat_bps=1500`;
    await expect(createOrder(client,input(),policy)).rejects.toThrow(state==='latest_incomplete'?'finance_calculation_policy_invalid':'finance_issuance_not_approved');
    for(const table of ['commerce_orders','commerce_order_items','finance_order_fiscal_snapshots','commerce_audit_events','commerce_payment_attempts'])expect(await count(table)).toBe(0);
    expect((await client.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`)[0]).toEqual({stock_available:10,stock_reserved:0});
  });
  it('rolls back reserved inventory and source items when the immutable fiscal snapshot cannot be inserted',async()=>{
    await client.$executeRawUnsafe('ALTER TABLE finance_order_fiscal_snapshots ADD CONSTRAINT fixture_fiscal_insert_failure CHECK(order_id=0)');
    try {
      await expect(createOrder(client,input(),policy)).rejects.toThrow();
      for(const table of ['commerce_orders','commerce_order_items','finance_order_fiscal_snapshots','commerce_audit_events'])expect(await count(table)).toBe(0);
      expect((await client.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`)[0]).toEqual({stock_available:10,stock_reserved:0});
    }finally{await client.$executeRawUnsafe('ALTER TABLE finance_order_fiscal_snapshots DROP CHECK fixture_fiscal_insert_failure');}
    await createOrder(client,input(),policy);expect(await count('finance_order_fiscal_snapshots')).toBe(1);
  });
  it('captures server price, customer, supplier allocation and approved policy at the original order timestamp without rewriting on retry',async()=>{
    await mapped();
    const order=await createOrder(client,input(),policy),before=await storedFiscalSnapshot(order.id);
    const [created]=await client.$queryRaw<{created_at:Date}[]>`SELECT created_at FROM commerce_orders WHERE id=${order.id}`;
    const [approved]=await client.$queryRaw<{id:bigint;request_id:bigint}[]>`SELECT id,request_id FROM finance_tax_policies WHERE policy_reference='synthetic-commerce-zero-rate'`;
    expect(before).toMatchObject({order_id:order.id,policy_id:approved.id,request_id:approved.request_id,captured_at:created.created_at});
    expect(before.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(before.snapshot).toMatchObject({version:2,orderId:String(order.id),capturedAt:created.created_at.toISOString(),currency:'SAR',customer:{name:shipping.name,address:'Fixture street 1، Riyadh، 12345، SA'},policy:{id:String(approved.id),requestId:String(approved.request_id),policyReference:'synthetic-commerce-zero-rate',calculationPolicy:syntheticCalculation},netMinor:2175,vatMinor:0,totalMinor:2175});
    expect(before.snapshot.lines).toEqual([
      {key:'1',title:'Fixture product',quantity:2,unitPriceMinor:1025,discountMinor:0,vatBps:0,priceBasis:'inclusive',component:'product',netMinor:2050,vatMinor:0,grossMinor:2050,supplierId:'1',supplierMinor:600},
      {key:'shipping',title:'الشحن',quantity:1,unitPriceMinor:125,discountMinor:0,vatBps:0,priceBasis:'inclusive',component:'shipping',netMinor:125,vatMinor:0,grossMinor:125},
    ]);
    await client.$executeRaw`UPDATE commerce_products SET title='Changed catalog name',price_minor=9999 WHERE id=1`;
    await approvedFiscalPolicy({reference:'synthetic-replacement-policy',effectiveFrom:'2020-01-02',vatBps:1500,calculationPolicy:{...syntheticCalculation,priceBasis:'exclusive'}});
    expect(await createOrder(client,input(),{shippingFeeMinor:900})).toEqual(order);
    await expect(createOrder(client,{...input(),shipping:{...shipping,name:'Changed customer'}},policy)).rejects.toThrow('request_conflict');
    expect(await storedFiscalSnapshot(order.id)).toEqual(before);expect(await count('finance_order_fiscal_snapshots')).toBe(1);
  });
  it.each([
    {basis:'inclusive' as const,itemGross:2050,shippingGross:125,total:2175,net:1902,vat:273},
    {basis:'exclusive' as const,itemGross:2358,shippingGross:131,total:2489,net:2175,vat:314},
  ])('captures and charges exact $basis item and shipping tax totals',async({basis,itemGross,shippingGross,total,net,vat})=>{
    await approvedFiscalPolicy({reference:'synthetic-priced-policy',effectiveFrom:'2020-01-02',vatBps:1500,calculationPolicy:{...syntheticCalculation,priceBasis:basis,shippingPriceBasis:basis,shippingVatBps:500}});
    const order=await createOrder(client,input(),policy),saved=await storedFiscalSnapshot(order.id);
    expect(order).toMatchObject({subtotalMinor:itemGross,shippingFeeMinor:shippingGross,totalMinor:total,items:[{unitPriceMinor:1025,totalMinor:itemGross}]});
    expect(saved.snapshot).toMatchObject({netMinor:net,vatMinor:vat,totalMinor:total});
    expect(saved.snapshot.lines.map(line=>line.grossMinor)).toEqual([itemGross,shippingGross]);
    const claim=await claimPaymentAttempt(client,{memberId:1n,orderId:order.id,provider:'fixture'});expect(claim.claimed).toBe(true);expect(claim.attempt.amountMinor).toBe(total);
  });
  it('rejects a new payment attempt after the effective policy changes while preserving the original order and reservation',async()=>{
    const order=await createOrder(client,input(),policy),snapshot=await storedFiscalSnapshot(order.id);
    await approvedFiscalPolicy({reference:'synthetic-payment-rollover',effectiveFrom:'2020-01-02',vatBps:1500,calculationPolicy:{...syntheticCalculation,priceBasis:'exclusive'}});
    await expect(claimPaymentAttempt(client,{memberId:1n,orderId:order.id,provider:'fixture'})).rejects.toThrow('finance_policy_changed_before_payment');
    expect(await count('commerce_payment_attempts')).toBe(0);expect(await storedFiscalSnapshot(order.id)).toEqual(snapshot);
    expect((await client.$queryRaw<{status:string;total_minor:number}[]>`SELECT status,total_minor FROM commerce_orders WHERE id=${order.id}`)[0]).toEqual({status:'awaiting_payment',total_minor:2175});
    expect((await client.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`)[0]).toEqual({stock_available:8,stock_reserved:2});
  });
  it('keeps an existing payment attempt retry-safe and records verified money after policy rollover without repricing',async()=>{
    const {order,claim,evidence}=await prepared(),snapshot=await storedFiscalSnapshot(order.id);
    await recordPaymentReference(client,{attemptId:claim.attempt.id,claimToken:claim.claimToken,reference:evidence.reference,redirectUrl:'https://fixture.invalid/existing-checkout'});
    await approvedFiscalPolicy({reference:'synthetic-settlement-rollover',effectiveFrom:'2020-01-02',vatBps:1500,calculationPolicy:{...syntheticCalculation,priceBasis:'exclusive'}});
    const retry=await claimPaymentAttempt(client,{memberId:1n,orderId:order.id,provider:'fixture'});expect(retry.claimed).toBe(false);expect(retry.attempt.id).toBe(claim.attempt.id);expect(retry.attempt.amountMinor).toBe(2175);
    expect(retry.attempt.redirectUrl).toBeNull();
    expect((await client.$queryRaw<{redirect_url:string}[]>`SELECT redirect_url FROM commerce_payment_attempts WHERE id=${claim.attempt.id}`)[0].redirect_url).toBe('https://fixture.invalid/existing-checkout');
    await settleVerifiedPayment(client,evidence,targets);
    expect(await count('commerce_receipts')).toBe(1);expect(await count('commerce_payment_attempts')).toBe(1);expect(await storedFiscalSnapshot(order.id)).toEqual(snapshot);
    expect((await client.$queryRaw<{amount_minor:number}[]>`SELECT amount_minor FROM commerce_receipts WHERE order_id=${order.id}`)[0].amount_minor).toBe(2175);
  });
  it('installs all five supplier accounting tables idempotently',async()=>{
    const tables=await client.$queryRaw<{name:string}[]>`SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()`;
    expect(tables.map(t=>t.name)).toEqual(expect.arrayContaining(['commerce_suppliers','commerce_product_suppliers','commerce_order_suppliers','commerce_receipts','commerce_supplier_accruals']));
    for(const ddl of COMMERCE_DDL) await client.$executeRawUnsafe(ddl);
    await assertCommerceSchemaReady(client);
    await client.$executeRaw`INSERT INTO commerce_suppliers (name) VALUES ('Disabled by default')`;
    const [supplier]=await client.$queryRaw<{active:number;api_enabled:number;phone:string;api_base_url:string;api_credential_ref:string}[]>`SELECT active,api_enabled,phone,api_base_url,api_credential_ref FROM commerce_suppliers`;
    expect(supplier).toEqual({active:0,api_enabled:0,phone:'',api_base_url:'',api_credential_ref:''});
  });
  it.each(supplierForeignKeys)('requires semantic FK %s(%s) even when constraint names differ',async(table,columns,parent,refs,_name)=>{
    const rows=await client.$queryRaw<{name:string;cols:string}[]>`SELECT CONSTRAINT_NAME AS name,GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION) AS cols FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=${table} AND REFERENCED_TABLE_NAME IS NOT NULL GROUP BY CONSTRAINT_NAME`;
    const fk=rows.find(row=>row.cols===columns);
    if(!fk) throw new Error('fixture FK missing');
    await client.$executeRawUnsafe('ALTER TABLE '+table+' DROP FOREIGN KEY `'+fk.name+'`');
    try {await expect(assertCommerceSchemaReady(client)).rejects.toThrow('commerce_schema_not_ready');}
    finally {await client.$executeRawUnsafe('ALTER TABLE '+table+' ADD CONSTRAINT `'+fk.name+'_renamed` FOREIGN KEY ('+columns+') REFERENCES '+parent+'('+refs+') ON DELETE RESTRICT ON UPDATE RESTRICT');}
    await assertCommerceSchemaReady(client);
  });
  it('rejects an FK pointing at the wrong parent despite identical child columns',async()=>{
    const [fk]=await client.$queryRaw<{name:string}[]>`SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commerce_product_suppliers' AND COLUMN_NAME='supplier_id' AND REFERENCED_TABLE_NAME IS NOT NULL`;
    await client.$executeRawUnsafe('ALTER TABLE commerce_product_suppliers DROP FOREIGN KEY `'+fk.name+'`, ADD CONSTRAINT fixture_wrong_parent FOREIGN KEY (supplier_id) REFERENCES commerce_orders(id)');
    try {await expect(assertCommerceSchemaReady(client)).rejects.toThrow('commerce_schema_not_ready');}
    finally {await client.$executeRawUnsafe('ALTER TABLE commerce_product_suppliers DROP FOREIGN KEY fixture_wrong_parent, ADD CONSTRAINT `'+fk.name+'` FOREIGN KEY (supplier_id) REFERENCES commerce_suppliers(id)');}
  });
  it('rejects reversed referenced columns on a composite FK',async()=>{
    const [fk]=await client.$queryRaw<{name:string}[]>`SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commerce_order_suppliers' AND COLUMN_NAME='order_id' AND REFERENCED_TABLE_NAME IS NOT NULL`;
    await client.$executeRawUnsafe('ALTER TABLE commerce_order_items ADD UNIQUE KEY fixture_reverse (product_id,order_id)');
    await client.$executeRawUnsafe('ALTER TABLE commerce_order_suppliers DROP FOREIGN KEY `'+fk.name+'`, ADD CONSTRAINT fixture_wrong_columns FOREIGN KEY (order_id,product_id) REFERENCES commerce_order_items(product_id,order_id)');
    try {await expect(assertCommerceSchemaReady(client)).rejects.toThrow('commerce_schema_not_ready');}
    finally {
      await client.$executeRawUnsafe('ALTER TABLE commerce_order_suppliers DROP FOREIGN KEY fixture_wrong_columns, ADD CONSTRAINT `'+fk.name+'` FOREIGN KEY (order_id,product_id) REFERENCES commerce_order_items(order_id,product_id)');
      // InnoDB may replace the implicit product FK index with our composite index.
      await client.$executeRawUnsafe('ALTER TABLE commerce_order_items ADD INDEX fixture_product_support (product_id)');
      await client.$executeRawUnsafe('ALTER TABLE commerce_order_items DROP INDEX fixture_reverse');
    }
  });
  it('rejects cascading deletion of immutable receipts',async()=>{
    const [fk]=await client.$queryRaw<{name:string}[]>`SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commerce_receipts' AND COLUMN_NAME='order_id' AND REFERENCED_TABLE_NAME IS NOT NULL`;
    await client.$executeRawUnsafe('ALTER TABLE commerce_receipts DROP FOREIGN KEY `'+fk.name+'`, ADD CONSTRAINT fixture_cascade FOREIGN KEY (order_id) REFERENCES commerce_orders(id) ON DELETE CASCADE');
    try {await expect(assertCommerceSchemaReady(client)).rejects.toThrow('commerce_schema_not_ready');}
    finally {await client.$executeRawUnsafe('ALTER TABLE commerce_receipts DROP FOREIGN KEY fixture_cascade, ADD CONSTRAINT `'+fk.name+'` FOREIGN KEY (order_id) REFERENCES commerce_orders(id)');}
  });
  async function mapped() {
    await client.$executeRaw`INSERT INTO commerce_suppliers (id,name,active) VALUES (1,'Supplier A',1),(2,'Supplier B',1)`;
    await client.$executeRaw`UPDATE commerce_products SET stock_available=10 WHERE id=2`;
    await client.$executeRaw`INSERT INTO commerce_product_suppliers (product_id,supplier_id,supplier_sku,unit_cost_minor) VALUES (1,1,'A-sku',300),(2,2,'B-sku',50)`;
  }
  it('snapshots two suppliers and settles original costs after supplier disable and remapping',async()=>{
    await mapped();
    const order=await createOrder(client,{...input(),items:[{productId:1n,quantity:2},{productId:2n,quantity:3}]},policy);
    const snapshots=await client.$queryRaw<{supplier_name:string;total_cost_minor:number}[]>`SELECT supplier_name,total_cost_minor FROM commerce_order_suppliers ORDER BY product_id`;
    expect(snapshots).toEqual([{supplier_name:'Supplier A',total_cost_minor:600},{supplier_name:'Supplier B',total_cost_minor:150}]);
    expect(await count('commerce_receipts')).toBe(0);expect(await count('commerce_supplier_accruals')).toBe(0);
    await client.$executeRaw`UPDATE commerce_suppliers SET active=0,name='Changed'`;
    await client.$executeRaw`UPDATE commerce_product_suppliers SET unit_cost_minor=999,supplier_id=2`;
    expect((await createOrder(client,{...input(),items:[{productId:1n,quantity:2},{productId:2n,quantity:3}]},policy)).id).toBe(order.id);
    expect(await client.$queryRaw`SELECT supplier_name,total_cost_minor FROM commerce_order_suppliers ORDER BY product_id`).toEqual(snapshots);
    const claim=await claimPaymentAttempt(client,{memberId:1n,orderId:order.id,provider:'fixture'});
    if(!claim.claimed) throw new Error('claim missing');
    await recordPaymentReference(client,{attemptId:claim.attempt.id,claimToken:claim.claimToken,reference:'supplier-ref'});
    const evidence={verified:true,status:'paid',provider:'fixture',reference:'supplier-ref',merchantOrderId:claim.attempt.merchantOrderId,amountMinor:order.totalMinor,currency:'SAR'};
    await expect(settleVerifiedPayment(client,{...evidence,amountMinor:1},targets)).rejects.toThrow();
    expect(await count('commerce_receipts')).toBe(0);
    await Promise.all([settleVerifiedPayment(client,evidence,targets),settleVerifiedPayment(client,evidence,targets)]);
    expect(await count('commerce_receipts')).toBe(1);
    expect((await client.$queryRaw`SELECT provider,provider_ref,amount_minor,currency FROM commerce_receipts`)).toEqual([{provider:'fixture',provider_ref:'supplier-ref',amount_minor:order.totalMinor,currency:'SAR'}]);
    const accruals=await client.$queryRaw<{supplier_id:bigint;amount_minor:number;currency:string;status:string}[]>`SELECT supplier_id,amount_minor,currency,status FROM commerce_supplier_accruals ORDER BY product_id`;
    expect(accruals).toEqual([{supplier_id:1n,amount_minor:600,currency:'SAR',status:'offline_pending'},{supplier_id:2n,amount_minor:150,currency:'SAR',status:'offline_pending'}]);
  });
  it('blocks new orders for inactive mapped suppliers and rolls back reservations',async()=>{
    await mapped();await client.$executeRaw`UPDATE commerce_suppliers SET active=0 WHERE id=2`;
    await expect(createOrder(client,{...input(),items:[{productId:1n,quantity:2},{productId:2n,quantity:1}]},policy)).rejects.toThrow('supplier_unavailable');
    expect(await count('commerce_orders')).toBe(0);expect(await count('commerce_order_suppliers')).toBe(0);
    expect((await client.$queryRaw<{stock_available:number}[]>`SELECT stock_available FROM commerce_products WHERE id=1`)[0].stock_available).toBe(10);
  });
  it('keeps unmapped goods internal and creates only a verified receipt',async()=>{
    const {evidence}=await prepared();expect(await count('commerce_order_suppliers')).toBe(0);
    await settleVerifiedPayment(client,evidence,targets);
    expect(await count('commerce_receipts')).toBe(1);expect(await count('commerce_supplier_accruals')).toBe(0);
  });
  it('rejects case-insensitive receipt identifiers at schema readiness',async()=>{
    await client.$executeRawUnsafe('ALTER TABLE commerce_receipts MODIFY provider_ref VARCHAR(160) COLLATE utf8mb4_general_ci NOT NULL');
    try {await expect(assertCommerceSchemaReady(client)).rejects.toThrow('commerce_schema_not_ready');}
    finally {await client.$executeRawUnsafe('ALTER TABLE commerce_receipts MODIFY provider_ref VARCHAR(160) COLLATE utf8mb4_bin NOT NULL');}
  });
  it('rolls back receipt, accrual, paid state and stock when outbox insertion fails',async()=>{
    await mapped();const {order,evidence}=await prepared();
    await client.$executeRaw`INSERT INTO commerce_notifications (order_id,event,channel,recipient,payload) VALUES (${order.id},'payment_paid','in_app','member:1','{}')`;
    try {
      await expect(settleVerifiedPayment(client,evidence,targets)).rejects.toThrow();
      expect(await count('commerce_receipts')).toBe(0);expect(await count('commerce_supplier_accruals')).toBe(0);
      expect((await client.$queryRaw<{status:string}[]>`SELECT status FROM commerce_orders WHERE id=${order.id}`)[0].status).toBe('awaiting_payment');
      expect((await client.$queryRaw<{stock_reserved:number}[]>`SELECT stock_reserved FROM commerce_products WHERE id=1`)[0].stock_reserved).toBe(2);
      expect((await client.$queryRaw<{status:string}[]>`SELECT status FROM commerce_payment_attempts WHERE order_id=${order.id}`)[0].status).toBe('pending');
    } finally {await client.$executeRaw`DELETE FROM commerce_notifications WHERE order_id=${order.id}`;}
    await settleVerifiedPayment(client,evidence,targets);
    expect(await count('commerce_receipts')).toBe(1);expect(await count('commerce_supplier_accruals')).toBe(1);
  });
  it('schema gate rejects a missing receipt idempotency index',async()=>{
    await client.$executeRawUnsafe('ALTER TABLE commerce_receipts DROP INDEX commerce_receipt_reference');
    try {await expect(assertCommerceSchemaReady(client)).rejects.toThrow('commerce_schema_not_ready');}
    finally {await client.$executeRawUnsafe('ALTER TABLE commerce_receipts ADD UNIQUE KEY commerce_receipt_reference (provider,provider_ref)');}
  });
  it('rejects non-SAR supplier mapping without creating an order',async()=>{
    await mapped();await client.$executeRaw`UPDATE commerce_product_suppliers SET currency='USD' WHERE product_id=1`;
    await expect(createOrder(client,input(),policy)).rejects.toThrow('supplier_currency_invalid');
    expect(await count('commerce_orders')).toBe(0);
  });
  it.each([-1,2147483647])('rejects invalid or overflowing trusted supplier cost %s',async cost=>{
    await mapped();await client.$executeRaw`UPDATE commerce_product_suppliers SET unit_cost_minor=${cost} WHERE product_id=1`;
    await expect(createOrder(client,input(),policy)).rejects.toThrow();
    expect(await count('commerce_orders')).toBe(0);
  });
  it('rejects replay with different quantity/address and does not recalculate old prices',async()=>{
    const first=await createOrder(client,input(),policy);
    await client.$executeRaw`UPDATE commerce_products SET price_minor=9999 WHERE id=1`;
    expect((await createOrder(client,input(),policy)).totalMinor).toBe(first.totalMinor);
    await expect(createOrder(client,input(undefined,3),policy)).rejects.toThrow('request_conflict');
    await expect(createOrder(client,{...input(),shipping:{...shipping,city:'Jeddah'}},policy)).rejects.toThrow('request_conflict');
  });
  it.each(['approved','visible','enabled'])('rejects non-purchasable %s product',async field=>{
    await client.$executeRawUnsafe(`UPDATE commerce_products SET ${field}=0 WHERE id=1`);
    await expect(createOrder(client,input(),policy)).rejects.toThrow('product_unavailable');
    expect(await count('commerce_orders')).toBe(0);
  });
  it('rolls back earlier stock reservation if a later item is unavailable',async()=>{
    await expect(createOrder(client,{...input(),items:[{productId:1n,quantity:2},{productId:2n,quantity:1}]},policy)).rejects.toThrow();
    const [p]=await client.$queryRaw<{stock_available:number}[]>`SELECT stock_available FROM commerce_products WHERE id=1`;
    expect(p.stock_available).toBe(10);expect(await count('commerce_orders')).toBe(0);
  });
  it('never oversells concurrent different orders',async()=>{
    const results=await Promise.allSettled([createOrder(client,input('stock-request-0001',7),policy),createOrder(client,input('stock-request-0002',7),policy)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(await count('commerce_orders')).toBe(1);
  });
  it('ignores stale admin stock snapshots and applies only safe deltas after reservation',async()=>{
    await createOrder(client,input('stale-stock-request-0001',3),policy);
    const stocks=async()=> (await client.$queryRaw<{stock_available:number;stock_reserved:number;title:string}[]>`SELECT stock_available,stock_reserved,title FROM commerce_products WHERE id=1`)[0];
    expect(await stocks()).toEqual({stock_available:7,stock_reserved:3,title:'Fixture product'});
    const data={title:'Updated metadata',priceMinor:1025,stock:10,adId:null,approved:true,visible:true,enabled:true};
    await client.$transaction(tx=>updateCommerceProduct(tx,1n,data,0));
    expect(await stocks()).toEqual({stock_available:7,stock_reserved:3,title:'Updated metadata'});
    await client.$transaction(tx=>updateCommerceProduct(tx,1n,data,2));
    expect(await stocks()).toEqual({stock_available:9,stock_reserved:3,title:'Updated metadata'});
    await expect(client.$transaction(tx=>updateCommerceProduct(tx,1n,{...data,title:'Must not persist'},-10))).rejects.toThrow('invalid_stock_adjustment');
    expect(await stocks()).toEqual({stock_available:9,stock_reserved:3,title:'Updated metadata'});
  });
  it('grants one payment creation claim and never retries an uncertain attempt',async()=>{
    const order=await createOrder(client,input(),policy);
    const request={memberId:1n,orderId:order.id,provider:'fixture'};
    const claims=await Promise.all([claimPaymentAttempt(client,request),claimPaymentAttempt(client,request)]);
    expect(claims.filter(c=>c.claimed)).toHaveLength(1);
    const winner=claims.find(c=>c.claimed)!;
    if(!winner.claimed) throw new Error('missing winner');
    await markPaymentUncertain(client,{attemptId:winner.attempt.id,claimToken:winner.claimToken});
    expect((await claimPaymentAttempt(client,request)).claimed).toBe(false);
    expect(await count('commerce_payment_attempts')).toBe(1);
    await expect(claimPaymentAttempt(client,{...request,memberId:2n})).rejects.toThrow('order_not_found');
  });
  it('cancels an unstarted order and releases stock once even with concurrent replay',async()=>{
    const order=await createOrder(client,input(),policy);
    await expect(cancelUnstartedOrder(client,{memberId:2n,orderId:order.id})).rejects.toThrow('order_not_found');
    const results=await Promise.all([cancelUnstartedOrder(client,{memberId:1n,orderId:order.id}),cancelUnstartedOrder(client,{memberId:1n,orderId:order.id})]);
    expect(results.filter(result=>!result.alreadyCancelled)).toHaveLength(1);
    const [p]=await client.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`;
    expect(p).toEqual({stock_available:10,stock_reserved:0});
    const [o]=await client.$queryRaw<{status:string}[]>`SELECT status FROM commerce_orders`;
    expect(o.status).toBe('cancelled');
    const [a]=await client.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM commerce_audit_events WHERE event='order_cancelled'`;
    expect(Number(a.n)).toBe(1);
    await expect(claimPaymentAttempt(client,{memberId:1n,orderId:order.id,provider:'fixture'})).rejects.toThrow('order_not_payable');
  });
  it.each(['creating','pending','uncertain','paid'])('never cancels/releases stock after any %s payment attempt',async status=>{
    const order=await createOrder(client,input(),policy);
    const claim=await claimPaymentAttempt(client,{memberId:1n,orderId:order.id,provider:'fixture'});
    await client.$executeRaw`UPDATE commerce_payment_attempts SET status=${status} WHERE id=${claim.attempt.id}`;
    await expect(cancelUnstartedOrder(client,{memberId:1n,orderId:order.id})).rejects.toThrow('payment_attempt_exists');
    const [p]=await client.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`;
    expect(p).toEqual({stock_available:8,stock_reserved:2});
  });
  it('serializes cancellation against payment claim without releasing potentially paid stock',async()=>{
    const order=await createOrder(client,input(),policy);
    const results=await Promise.allSettled([cancelUnstartedOrder(client,{memberId:1n,orderId:order.id}),claimPaymentAttempt(client,{memberId:1n,orderId:order.id,provider:'fixture'})]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    const [p]=await client.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`;
    const attempts=await count('commerce_payment_attempts');
    expect(p).toEqual(attempts?{stock_available:8,stock_reserved:2}:{stock_available:10,stock_reserved:0});
  });
  it.each([{amountMinor:2174},{currency:'USD'},{reference:'REF-fixture-request-0001'},{merchantOrderId:'invalid'},{provider:'other'},{verified:false},{status:'pending'}])('rejects mismatched settlement %j',async patch=>{
    const {evidence}=await prepared();
    await expect(settleVerifiedPayment(client,{...evidence,...patch},targets)).rejects.toThrow();
    expect(await count('commerce_receipts')).toBe(0);expect(await count('commerce_supplier_accruals')).toBe(0);
    expect(await count('commerce_notifications')).toBe(0);
    const [o]=await client.$queryRaw<{status:string}[]>`SELECT status FROM commerce_orders`;
    expect(o.status).not.toBe('paid');
  });
  it('settles paid once with unique recipient/channel outbox and one audit, no double stock consumption',async()=>{
    const {evidence}=await prepared();
    const results=await Promise.all([settleVerifiedPayment(client,evidence,[...targets,targets[0]]),settleVerifiedPayment(client,evidence,targets)]);
    expect(results.filter(r=>!r.alreadyPaid)).toHaveLength(1);
    expect(await count('commerce_notifications')).toBe(3);
    const [a]=await client.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM commerce_audit_events WHERE event='payment_paid'`;
    expect(Number(a.n)).toBe(1);
    const [p]=await client.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`;
    expect(p).toEqual({stock_available:8,stock_reserved:0});
  });
  it.each([true,false])('settles 50 accepted notification targets with mandatory member already included=%s',async includesMember=>{
    const {evidence}=await prepared();
    const recipients=Array.from({length:50},(_,i)=>({recipient:`member:${i+2}`,channel:'in_app' as const}));
    if(includesMember) recipients[0]={recipient:'member:1',channel:'in_app'};
    expect((await settleVerifiedPayment(client,evidence,recipients)).alreadyPaid).toBe(false);
    expect(await count('commerce_notifications')).toBe(includesMember?50:51);
    const [member]=await client.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM commerce_notifications WHERE recipient='member:1' AND channel='in_app'`;
    expect(Number(member.n)).toBe(1);
    expect((await settleVerifiedPayment(client,evidence,recipients)).alreadyPaid).toBe(true);
    expect(await count('commerce_notifications')).toBe(includesMember?50:51);
  });
  it('rolls back paid state and stock when an outbox insert fails',async()=>{
    const {evidence}=await prepared();
    await client.$executeRawUnsafe('ALTER TABLE commerce_notifications ADD CONSTRAINT fixture_outbox_failure CHECK (order_id = 0)');
    try {
      await expect(settleVerifiedPayment(client,evidence,targets)).rejects.toThrow();
      const [o]=await client.$queryRaw<{status:string}[]>`SELECT status FROM commerce_orders`;
      expect(o.status).toBe('awaiting_payment');expect(await count('commerce_notifications')).toBe(0);
      const [p]=await client.$queryRaw<{stock_reserved:number}[]>`SELECT stock_reserved FROM commerce_products WHERE id=1`;
      expect(p.stock_reserved).toBe(2);
    } finally {await client.$executeRawUnsafe('ALTER TABLE commerce_notifications DROP CHECK fixture_outbox_failure');}
    expect((await settleVerifiedPayment(client,evidence,targets)).alreadyPaid).toBe(false);
  });
  it('provider references are unique per provider and case-sensitive',async()=>{
    const first=await prepared();
    const second=await createOrder(client,input('second-request-0001'),policy);
    const claim=await claimPaymentAttempt(client,{memberId:1n,orderId:second.id,provider:'fixture'});
    if(!claim.claimed) throw new Error('no claim');
    await expect(recordPaymentReference(client,{attemptId:claim.attempt.id,claimToken:claim.claimToken,reference:first.evidence.reference})).rejects.toThrow();
    await recordPaymentReference(client,{attemptId:claim.attempt.id,claimToken:claim.claimToken,reference:first.evidence.reference.toUpperCase()});
  });
  it('persists one HTTPS redirect for replay and rejects unsafe/changed URLs',async()=>{
    const order=await createOrder(client,input(),policy);
    const request={memberId:1n,orderId:order.id,provider:'fixture'};
    const claim=await claimPaymentAttempt(client,request);
    if(!claim.claimed) throw new Error('no claim');
    const binding={attemptId:claim.attempt.id,claimToken:claim.claimToken,reference:'safe-ref'};
    for(const redirectUrl of ['http://example.test/pay','javascript:alert(1)','https://user:password@example.test/pay']) await expect(recordPaymentReference(client,{...binding,redirectUrl})).rejects.toThrow('invalid_redirect');
    await recordPaymentReference(client,{...binding,redirectUrl:'https://example.test/pay/session'});
    const replay=await claimPaymentAttempt(client,request);
    expect(replay.claimed).toBe(false);expect(replay.attempt.redirectUrl).toBe('https://example.test/pay/session');
    await expect(recordPaymentReference(client,{...binding,redirectUrl:'https://other.test/pay'})).rejects.toThrow('redirect_conflict');
  });
  it('schema gate rejects a missing uniqueness index',async()=>{
    await client.$executeRawUnsafe('ALTER TABLE commerce_notifications ADD KEY fixture_fk_support (order_id)');
    await client.$executeRawUnsafe('ALTER TABLE commerce_notifications DROP INDEX commerce_notifications_delivery');
    try {await expect(assertCommerceSchemaReady(client)).rejects.toThrow('commerce_schema_not_ready');}
    finally {await client.$executeRawUnsafe('ALTER TABLE commerce_notifications ADD UNIQUE KEY commerce_notifications_delivery (order_id,event,channel,recipient), DROP INDEX fixture_fk_support');}
  });
  it('dispatches a paid outbox row once with concurrent real MySQL claims',async()=>{
    const {evidence}=await prepared();
    await settleVerifiedPayment(client,evidence,targets);
    const [row]=await client.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_notifications WHERE channel='sms'`;
    const config=commerceConfigFromRows([{k:'commerce_notifications_enabled',v:'1'}]);
    const transport={sms:vi.fn().mockResolvedValue(true),whatsapp:vi.fn().mockResolvedValue(true)};
    const results=await Promise.all([dispatchPaidNotification(client,row.id,config,transport),dispatchPaidNotification(client,row.id,config,transport)]);
    expect(results.sort()).toEqual(['not_pending','sent']);
    expect(transport.sms).toHaveBeenCalledTimes(1);expect(transport.whatsapp).not.toHaveBeenCalled();
    const [saved]=await client.$queryRaw<{status:string;claim_token:string;sent_at:Date}[]>`SELECT status,claim_token,sent_at FROM commerce_notifications WHERE id=${row.id}`;
    expect(saved.status).toBe('sent');expect(saved.claim_token).toHaveLength(36);expect(saved.sent_at).toBeInstanceOf(Date);
  });
  it.each(['false','throw'])('persists unknown delivery on %s and never sends it again',async outcome=>{
    const {evidence}=await prepared();
    await settleVerifiedPayment(client,evidence,targets);
    const [row]=await client.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_notifications WHERE channel='sms'`;
    const config=commerceConfigFromRows([{k:'commerce_notifications_enabled',v:'1'}]);
    const transport={sms:vi.fn().mockResolvedValue(false),whatsapp:vi.fn().mockResolvedValue(true)};
    if(outcome==='throw') transport.sms.mockRejectedValue(new Error('fixture ambiguous timeout'));
    expect(await dispatchPaidNotification(client,row.id,config,transport)).toBe('unknown');
    expect(await dispatchPaidNotification(client,row.id,config,transport)).toBe('not_pending');
    expect(transport.sms).toHaveBeenCalledTimes(1);
    const [saved]=await client.$queryRaw<{status:string;last_error:string}[]>`SELECT status,last_error FROM commerce_notifications WHERE id=${row.id}`;
    expect(saved).toEqual({status:'unknown',last_error:'delivery_unconfirmed'});
    const [order]=await client.$queryRaw<{status:string}[]>`SELECT status FROM commerce_orders`;
    expect(order.status).toBe('paid');
  });
});
