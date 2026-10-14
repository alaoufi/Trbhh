import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
const db=await vi.hoisted(async()=>{
 if(process.env.CJ_SETTLEMENT_DB_TESTS!=='1')return {client:undefined,url:undefined};
 const url=new URL(process.env.CJ_SETTLEMENT_TEST_DATABASE_URL||'');
 if(url.protocol!=='mysql:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.port!=='33309'||url.pathname!=='/trbhh_cj_settlement_test'||url.username!=='root'||url.search||url.hash)throw Error('Refusing non-isolated CJ settlement database');
 const {PrismaClient}=await import('@prisma/client');return {client:new PrismaClient({datasourceUrl:url.href}),url:url.href};
});
vi.mock('@/lib/prisma',()=>({prisma:db.client}));
vi.mock('server-only',()=>({}));
import {COMMERCE_DDL} from '@/lib/commerce/schema';
import {prepareCjSettlementBatch,authorizeCjSettlementWalletBatch,reconcileCjSettlementBatch,getCjSettlementWalletAuthorization} from '@/lib/cj/settlements';
describe.skipIf(!db.client)('CJ settlement accounting on disposable MySQL',()=>{
 const client=db.client!;let admin:PrismaClient;let created=false;
 beforeAll(async()=>{
  const url=new URL(db.url!);url.pathname='/mysql';admin=new PrismaClient({datasourceUrl:url.href});
  await admin.$executeRawUnsafe('CREATE DATABASE trbhh_cj_settlement_test');created=true;
  expect((await client.$queryRaw<{db:string}[]>`SELECT DATABASE() AS db`)[0].db).toBe('trbhh_cj_settlement_test');
  for(const ddl of COMMERCE_DDL.filter(sql=>sql.includes('CREATE TABLE IF NOT EXISTS commerce_cj_settlement_')))await client.$executeRawUnsafe(ddl);
  await client.$executeRawUnsafe('CREATE TABLE commerce_orders(id BIGINT UNSIGNED PRIMARY KEY,status VARCHAR(24),currency VARCHAR(3),total_minor INT) ENGINE=InnoDB');
  await client.$executeRawUnsafe('CREATE TABLE commerce_receipts(order_id BIGINT UNSIGNED PRIMARY KEY,amount_minor INT,currency VARCHAR(3),recorded_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB');
  await client.$executeRawUnsafe('CREATE TABLE commerce_cj_fulfillment_outbox(id BIGINT UNSIGNED PRIMARY KEY,commerce_order_id BIGINT UNSIGNED,status VARCHAR(32),cj_order_id VARCHAR(100),pay_id VARCHAR(100),shipment_order_id VARCHAR(100),pay_expires_at DATETIME(3),quote_json JSON,evidence_json JSON,last_error VARCHAR(191) NULL) ENGINE=InnoDB');
 },20000);
 beforeEach(async()=>{
  for(const table of ['commerce_cj_settlement_wallet_grants','commerce_cj_settlement_lines','commerce_cj_settlement_batches','commerce_cj_fulfillment_outbox','commerce_receipts','commerce_orders'])await client.$executeRawUnsafe(`DELETE FROM ${table}`);
  for(let i=1;i<=10;i++){
   const quote=JSON.stringify({lines:[{quantity:2,supplierUnitUsdMinor:500}],supplierFreightUsdMinor:250,supplierTaxUsdMinor:50,supplierUsdMinor:1300});const proof=JSON.stringify({payment:{payId:`pay${i}`,shipmentOrderId:`ship${i}`,payableUsdMinor:1300}});
   await client.$executeRaw`INSERT INTO commerce_orders VALUES(${i},'paid','SAR',5000)`;
   await client.$executeRaw`INSERT INTO commerce_receipts(order_id,amount_minor,currency) VALUES(${i},5000,'SAR')`;
   await client.$executeRaw`INSERT INTO commerce_cj_fulfillment_outbox VALUES(${i},${i},'payment_ready',${`CJ${i}`},${`pay${i}`},${`ship${i}`},${new Date(Date.now()+3600000)},${quote},${proof},NULL)`;
  }
 },20000);
 afterAll(async()=>{await client?.$disconnect();try{if(created)await admin.$executeRawUnsafe('DROP DATABASE trbhh_cj_settlement_test');}finally{await admin?.$disconnect();}},15000);
 const ids=Array.from({length:10},(_,i)=>String(i+1));
 const count=async(table:string)=>Number((await client.$queryRawUnsafe<{n:bigint}[]>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);
 it('forged held or expired selection cannot reserve a line or authorize payment',async()=>{await client.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET last_error='price_changed' WHERE id=1`;await expect(prepareCjSettlementBatch(['1'],1n,'forged_held_key_0001')).rejects.toThrow();expect(await count('commerce_cj_settlement_lines')).toBe(0);await client.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET last_error=NULL,pay_expires_at=${new Date(0)} WHERE id=1`;await expect(prepareCjSettlementBatch(['1'],1n,'forged_expiry_key_01')).rejects.toThrow();await client.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET pay_expires_at=${new Date(Date.now()+3600000)} WHERE id=1`;const b=await prepareCjSettlementBatch(['1'],1n,'valid_then_held_0001');await client.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET last_error='stock_changed' WHERE id=1`;await expect(authorizeCjSettlementWalletBatch(b.id,1n,1300)).rejects.toThrow();expect(await count('commerce_cj_settlement_wallet_grants')).toBe(0);});
 it('ten orders retain exact per-order product freight tax totals',async()=>{const b=await prepareCjSettlementBatch(ids,1n,'ten_orders_request_001');expect(await count('commerce_cj_settlement_lines')).toBe(10);const [sum]=await client.$queryRaw<{total:unknown;products:unknown;shipping:unknown;tax:unknown}[]>`SELECT SUM(total_usd_minor) AS total,SUM(product_usd_minor) AS products,SUM(shipping_usd_minor) AS shipping,SUM(tax_usd_minor) AS tax FROM commerce_cj_settlement_lines WHERE batch_id=${BigInt(b.id)}`;expect([sum.total,sum.products,sum.shipping,sum.tax].map(Number)).toEqual([13000,10000,2500,500]);});
 it('concurrent overlapping batches reserve one membership only',async()=>{const results=await Promise.allSettled([prepareCjSettlementBatch(ids,1n,'concurrent_batch_key_1'),prepareCjSettlementBatch(ids,1n,'concurrent_batch_key_2')]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await count('commerce_cj_settlement_batches')).toBe(1);expect(await count('commerce_cj_settlement_lines')).toBe(10);});
 it('same selection request is idempotent across concurrent calls',async()=>{const a=await Promise.all([prepareCjSettlementBatch(ids,1n,'same_request_key_001'),prepareCjSettlementBatch(ids,1n,'same_request_key_001')]);expect(a[0].id).toBe(a[1].id);expect(await count('commerce_cj_settlement_batches')).toBe(1);});
 it('failed line insert rolls back the entire metadata batch',async()=>{await client.$executeRawUnsafe('ALTER TABLE commerce_cj_settlement_lines ADD CONSTRAINT reject_lines CHECK (total_usd_minor=0)');try{await expect(prepareCjSettlementBatch(ids,1n,'rollback_request_key_1')).rejects.toThrow();expect(await count('commerce_cj_settlement_batches')).toBe(0);expect(await count('commerce_cj_settlement_lines')).toBe(0);}finally{await client.$executeRawUnsafe('ALTER TABLE commerce_cj_settlement_lines DROP CHECK reject_lines');}});
 it('mismatched receipt and paid supplier cannot enter a new batch',async()=>{await client.$executeRaw`UPDATE commerce_receipts SET amount_minor=1 WHERE order_id=1`;await expect(prepareCjSettlementBatch(['1'],1n,'wrong_receipt_key_001')).rejects.toThrow();await client.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET status='supplier_paid' WHERE id=2`;await expect(prepareCjSettlementBatch(['2'],1n,'paid_supplier_key_001')).rejects.toThrow();expect(await count('commerce_cj_settlement_batches')).toBe(0);});
 it('binds wallet approval to current total and payment and stores ten grants only once',async()=>{const b=await prepareCjSettlementBatch(ids,1n,'wallet_request_key_01');await expect(authorizeCjSettlementWalletBatch(b.id,1n,12999)).rejects.toThrow();expect(await count('commerce_cj_settlement_wallet_grants')).toBe(0);await Promise.all([authorizeCjSettlementWalletBatch(b.id,1n,13000),authorizeCjSettlementWalletBatch(b.id,1n,13000)]);expect(await count('commerce_cj_settlement_wallet_grants')).toBe(10);expect(await getCjSettlementWalletAuthorization('1')).toMatchObject({payId:'pay1',shipmentOrderId:'ship1',expectedUsdMinor:1300});await client.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET pay_id='changed' WHERE id=1`;expect(await getCjSettlementWalletAuthorization('1')).toBeNull();});
 it('matches payment independently and settles only when every supplier proof is confirmed',async()=>{const b=await prepareCjSettlementBatch(ids,1n,'reconcile_request_001');await client.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET status='supplier_paid' WHERE id=1`;const partial=await reconcileCjSettlementBatch(b.id);expect(partial?.status).toBe('prepared');expect(partial?.lines.filter(l=>l.status==='paid')).toHaveLength(1);await client.$executeRaw`UPDATE commerce_cj_fulfillment_outbox SET status='supplier_paid'`;expect((await reconcileCjSettlementBatch(b.id))?.status).toBe('settled');});
});
