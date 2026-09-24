import {afterAll,beforeAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {COMMERCE_DDL} from '@/lib/commerce/schema';
import {ACCESS_CONTROL_DDL} from '@/lib/access-control/schema';
import {FINANCE_DDL} from '@/lib/finance/schema';
import {requestFinanceChange,approveFinanceChange} from '@/lib/finance/workflows';
import type {FiscalCalculationPolicy} from '@/lib/finance/types';
import {SUPPLIER_DDL,assertSupplierSchemaReady} from '@/lib/suppliers/schema';
import {ONBOARDING_DDL} from '@/lib/suppliers/onboarding-schema';
import {upsertSourceProduct} from '@/lib/suppliers/catalog';
import {supplierConfig} from '@/lib/suppliers/config';
import {beginOAuth,completeOAuth,disconnectConnection,accessTokenForConnection} from '@/lib/suppliers/connections';
import {sealTokens} from '@/lib/suppliers/crypto';
import {SALLA_REQUIRED_SCOPES} from '@/lib/suppliers/salla-oauth';
import {createOrder,claimPaymentAttempt,recordPaymentReference,settleVerifiedPayment,cancelUnstartedOrder} from '@/lib/commerce/orders';
import {dispatchSupplierOrder} from '@/lib/suppliers/orders';
import {receiveSallaEvent} from '@/lib/suppliers/webhooks';
import {processNextSupplierEvent} from '@/lib/suppliers/worker';
import {recordSupplierTracking,memberOrderTracking,deliverSupplierNotices} from '@/lib/suppliers/tracking';
import {deliverCoordinatorNotifications} from '@/lib/suppliers/coordinator';
import {addPriceTier} from '@/lib/suppliers/admin';
import type {SupplierProduct} from '@/lib/suppliers/types';
const config=supplierConfig({SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa',SALLA_CLIENT_ID:'fixture',SALLA_CLIENT_SECRET:'fixture',SUPPLIER_TOKEN_ENCRYPTION_KEY:'ab'.repeat(32)});
const liveConfig=supplierConfig({SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa',SALLA_CLIENT_ID:'fixture',SALLA_CLIENT_SECRET:'fixture',SUPPLIER_TOKEN_ENCRYPTION_KEY:'ab'.repeat(32),SUPPLIER_ALLOW_LIVE_ORDERS:'true'});
const product:SupplierProduct={externalId:'10',sku:'fixture',name:'Fixture',description:'Synthetic only',images:[],variants:[],options:[],categories:[],brand:'',publicPriceMinor:5000,currency:'SAR',quantity:100,available:true,sourceUpdatedAt:null};
const shipping={name:'Fixture',phone:'+966500000000',addressLine:'Fixture district، Fixture street، 1',city:'Riyadh',postalCode:'12345',country:'SA' as const,region:'Riyadh Region',district:'Fixture district',street:'Fixture street',buildingNumber:'1',secondaryNumber:'',alternatePhone:null,email:'',shortAddress:'',deliveryNotes:''};
let db:PrismaClient,admin:PrismaClient,created=false;
const tables=['finance_order_fiscal_snapshots','finance_tax_policies','finance_change_requests','finance_audit','supplier_webhook_events','supplier_shipments','supplier_coordinator_notifications','supplier_order_sync_attempts','supplier_orders','supplier_reservation_allocations','supplier_stock_reservations','supplier_price_tiers','supplier_price_history','supplier_products','supplier_oauth_states','supplier_connections','supplier_onboarding','supplier_integration_profiles','commerce_supplier_accruals','commerce_receipts','commerce_order_suppliers','commerce_product_suppliers','commerce_notifications','commerce_audit_events','commerce_payment_attempts','commerce_order_items','commerce_orders','commerce_products','commerce_suppliers','access_user_roles','access_role_permissions','access_roles','access_departments','access_control_state','users'];
/** Explicit synthetic policy and staff in the disposable DB; never production defaults. */
async function approveFixtureFiscalPolicy(){
 const approvedAt=new Date(Date.now()-3*86400000),effectiveFrom=new Date(Date.now()-2*86400000+10800000).toISOString().slice(0,10);
 await db.$executeRaw`INSERT INTO users(id,name) VALUES(41,'Synthetic tax maker'),(42,'Synthetic tax checker and invoice delegate')`;
 await db.$executeRaw`INSERT INTO access_control_state(id,initialized_at) VALUES(1,${approvedAt})`;
 await db.$executeRaw`INSERT INTO access_departments(id,name) VALUES('fixture-finance','Synthetic finance')`;
 await db.$executeRaw`INSERT INTO access_roles(id,name,department_id) VALUES('fixture-tax-maker','Synthetic tax maker','fixture-finance'),('fixture-tax-checker','Synthetic tax checker','fixture-finance')`;
 await db.$executeRaw`INSERT INTO access_role_permissions(role_id,permission) VALUES('fixture-tax-maker','tax:view'),('fixture-tax-maker','tax:manage_settings'),('fixture-tax-checker','tax:view'),('fixture-tax-checker','tax:approve'),('fixture-tax-checker','invoices:view'),('fixture-tax-checker','invoices:create')`;
 await db.$executeRaw`INSERT INTO access_user_roles(user_id,role_id) VALUES(41,'fixture-tax-maker'),(42,'fixture-tax-checker')`;
 const calculationPolicy:FiscalCalculationPolicy={version:2,priceBasis:'inclusive',itemScope:'uniform_catalog',shippingPriceBasis:'inclusive',shippingVatBps:0,discountTreatment:'none',rounding:'line_half_up',policyRollover:'hold_for_review',automationDelegateId:'42',vatControl:{enabled:false,registrationConfirmed:false,registrationEffectiveFrom:null,registrationThresholdMinor:37500000}};
 const request=await requestFinanceChange(db,41n,{kind:'tax_settings',targetId:'tax',requestKey:'synthetic-supplier-zero-rate',reason:'Preserve explicit synthetic supplier fixture amounts',payload:{effectiveFrom,issuer:{name:'Synthetic supplier fixture issuer',taxNumber:'300000000000003',address:'Synthetic issuer address'},vatBps:0,policyReference:'synthetic-supplier-zero-rate',calculationPolicy}},approvedAt);
 await approveFinanceChange(db,42n,request,'Independent synthetic approval',approvedAt);
}
describe.skipIf(process.env.SUPPLIER_DB_TESTS!=='1')('isolated supplier MySQL proof',()=>{
 beforeAll(async()=>{const url=new URL(process.env.SUPPLIER_TEST_DATABASE_URL||'');if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||url.port!=='33309'||url.pathname!=='/trbhh_supplier_test'||url.search||url.hash)throw new Error('Refusing non-isolated supplier DB');db=new PrismaClient({datasourceUrl:url.href,log:[]});url.pathname='/mysql';admin=new PrismaClient({datasourceUrl:url.href,log:[]});await admin.$executeRawUnsafe('CREATE DATABASE trbhh_supplier_test');created=true;await db.$executeRawUnsafe("CREATE TABLE users(id BIGINT UNSIGNED NOT NULL PRIMARY KEY,name VARCHAR(255) NULL,ban ENUM('checked','no') NULL DEFAULT 'no',ban_until DATETIME NULL,archived_at DATETIME NULL,merged_into BIGINT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");for(const ddl of [...ACCESS_CONTROL_DDL,...COMMERCE_DDL,...SUPPLIER_DDL,...ONBOARDING_DDL,...FINANCE_DDL])await db.$executeRawUnsafe(ddl);await assertSupplierSchemaReady(db);});
 afterAll(async()=>{await db?.$disconnect();try{if(created)await admin.$executeRawUnsafe('DROP DATABASE trbhh_supplier_test');}finally{await admin?.$disconnect();}});
 beforeEach(async()=>{for(const table of tables)await db.$executeRawUnsafe(`DELETE FROM ${table}`);await db.$executeRaw`INSERT INTO commerce_suppliers(id,name,active) VALUES(1,'Fixture supplier',1)`;await db.$executeRaw`INSERT INTO supplier_integration_profiles(supplier_id,provider,sync_enabled,auto_orders_enabled,mode) VALUES(1,'salla',1,1,'live')`;await db.$executeRaw`INSERT INTO supplier_onboarding(supplier_id,registration_number,store_url,encrypted_details) VALUES(1,'1234567890','https://fixture.salla.sa','fixture')`;await db.$executeRaw`INSERT INTO supplier_connections(id,supplier_id,provider,external_store_id,status,oauth_scope_version,encrypted_tokens,expires_at) VALUES(1,1,'salla','999','connected',1,${sealTokens({accessToken:'fixture-access',refreshToken:'fixture-refresh'},'salla:1:999',config.encryptionKey)},${new Date(Date.now()+86400000)})`;});
 beforeAll(async()=>{await db.$executeRawUnsafe('CREATE TABLE admin_log (id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,admin_id BIGINT UNSIGNED NOT NULL,action VARCHAR(60) NOT NULL,target VARCHAR(160) NULL,note VARCHAR(300) NULL,created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');});
 beforeEach(async()=>{await db.$executeRaw`DELETE FROM admin_log`;});
 beforeAll(async()=>{
  await db.$executeRawUnsafe('CREATE TABLE site_settings (k VARCHAR(60) NOT NULL PRIMARY KEY,v TEXT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  await db.$executeRawUnsafe('CREATE TABLE notfications (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,title VARCHAR(191) NOT NULL,route TEXT NOT NULL,user_id VARCHAR(191) NOT NULL,created_at TIMESTAMP NULL,updated_at TIMESTAMP NULL,type VARCHAR(191) NULL,model_id INT NOT NULL DEFAULT 0,read_at DATETIME NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
 });
 beforeEach(async()=>{await db.$executeRaw`DELETE FROM notfications`;await db.$executeRaw`DELETE FROM site_settings`;await db.$executeRaw`INSERT INTO site_settings(k,v) VALUES('commerce_purchasing_enabled','1')`;});
 beforeEach(approveFixtureFiscalPolicy);
 it('installs all new tables idempotently with parity constraints',async()=>{for(const ddl of SUPPLIER_DDL)await db.$executeRawUnsafe(ddl);await assertSupplierSchemaReady(db);});
 it('imports hidden and preserves admin pricing/visibility on repeated sync',async()=>{await upsertSourceProduct(db,1n,product);const [p]=await db.$queryRaw<{id:bigint;active:number;visible:number}[]>`SELECT id,active,visible FROM supplier_products`;expect(p.active).toBe(0);expect(p.visible).toBe(0);await db.$executeRaw`UPDATE supplier_products SET unit_cost_minor=4000,selling_price_minor=4700,featured=1 WHERE id=${p.id}`;await upsertSourceProduct(db,1n,{...product,publicPriceMinor:5500});const [after]=await db.$queryRaw<{visible:number;unit_cost_minor:number;selling_price_minor:number;public_price_minor:number;featured:number}[]>`SELECT visible,unit_cost_minor,selling_price_minor,public_price_minor,featured FROM supplier_products`;expect(after).toEqual({visible:0,unit_cost_minor:4000,selling_price_minor:4700,public_price_minor:5500,featured:1});});
 it('stores a duplicate webhook only once',async()=>{const event={key:'fixture-key',event:'product.created',merchant:'999',resourceId:'10',occurredAt:new Date().toISOString(),kind:'product' as const};await Promise.all([receiveSallaEvent(db,event),receiveSallaEvent(db,event)]);expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM supplier_webhook_events`)[0].n).toBe(1n);});
 it('rejects a callback that finishes after disconnect',async()=>{const start=await beginOAuth(db,1n,5n,config);const state=new URL(start.url).searchParams.get('state')!;let resolve!:()=>void;const paused=new Promise<void>(r=>{resolve=r;});let reached!:()=>void;const started=new Promise<void>(r=>{reached=r;});const fetcher=vi.fn(async(url:RequestInfo|URL)=>{if(String(url).endsWith('/token')){reached();await paused;return new Response(JSON.stringify({access_token:'new',refresh_token:'new-r',expires_in:3600}));}return new Response(JSON.stringify({success:true,data:{merchant:{id:999,name:'Fixture supplier',domain:'https://fixture.salla.sa'}}}));});const pending=completeOAuth(db,{state,browser:start.browser,adminId:5n,code:'fixture-code',scope:SALLA_REQUIRED_SCOPES.join(' ')},config,fetcher);await started;await disconnectConnection(db,1n);resolve();await expect(pending).rejects.toThrow('supplier_oauth_superseded');expect((await db.$queryRaw<{status:string;encrypted_tokens:string|null}[]>`SELECT status,encrypted_tokens FROM supplier_connections`)[0]).toEqual({status:'disconnected',encrypted_tokens:null});});
 it('refreshes single-use token only once under concurrent calls',async()=>{await db.$executeRaw`UPDATE supplier_connections SET expires_at=${new Date(Date.now()-1000)} WHERE id=1`;let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});let signal!:()=>void;const started=new Promise<void>(r=>{signal=r;});const fetcher=vi.fn(async()=>{signal();await wait;return new Response(JSON.stringify({access_token:'rotated',refresh_token:'rotated-r',expires_in:3600}));});const first=accessTokenForConnection(db,1n,config,fetcher);await started;await expect(accessTokenForConnection(db,1n,config,fetcher)).rejects.toThrow('supplier_refresh_busy');release();expect(await first).toBe('rotated');expect(fetcher).toHaveBeenCalledTimes(1);});
 async function mapped(){await upsertSourceProduct(db,1n,product);await db.$executeRaw`INSERT INTO commerce_products(id,title,price_minor,stock_available,approved,visible,enabled) VALUES(1,'Fixture',4700,100,1,1,1)`;await db.$executeRaw`UPDATE supplier_products SET commerce_product_id=1,active=1,visible=1,unit_cost_minor=4000,selling_price_minor=4700`;await db.$executeRaw`INSERT INTO commerce_product_suppliers(product_id,supplier_id,supplier_sku,unit_cost_minor) VALUES(1,1,'fixture',4000)`;const [p]=await db.$queryRaw<{id:bigint}[]>`SELECT id FROM supplier_products`;await db.$executeRaw`INSERT INTO supplier_stock_reservations(submission_key,supplier_product_id,kind,quantity,remaining_quantity,unit_cost_minor,active) VALUES('00000000-0000-4000-8000-000000000001',${p.id},'prepaid',50,50,3500,1)`;}
 const newOrder=(key:string)=>createOrder(db,{memberId:5n,requestKey:key,items:[{productId:1n,quantity:2}],shipping},{shippingFeeMinor:0});
 it('holds then consumes once only after payment; duplicate dispatch simulates once',async()=>{await mapped();const order=await newOrder('fixture-order-key-1');const [so]=await db.$queryRaw<{id:bigint;payable_minor:number;profit_minor:number}[]>`SELECT id,payable_minor,profit_minor FROM supplier_orders`;expect(so.payable_minor).toBe(7000);expect(so.profit_minor).toBe(2400);expect(await dispatchSupplierOrder(db,so.id,config)).toEqual({status:'ineligible'});const claim=await claimPaymentAttempt(db,{memberId:5n,orderId:order.id,provider:'fixture'});if(!claim.claimed)throw new Error();await recordPaymentReference(db,{attemptId:claim.attempt.id,claimToken:claim.claimToken,reference:'fixture-bank-ref'});const evidence={verified:true,status:'paid',provider:'fixture',reference:'fixture-bank-ref',merchantOrderId:claim.attempt.merchantOrderId,amountMinor:9400,currency:'SAR'};await settleVerifiedPayment(db,evidence,[]);await settleVerifiedPayment(db,evidence,[]);const [r]=await db.$queryRaw<{remaining_quantity:number;held_quantity:number}[]>`SELECT remaining_quantity,held_quantity FROM supplier_stock_reservations`;expect(r).toEqual({remaining_quantity:48,held_quantity:0});await db.$executeRaw`UPDATE supplier_integration_profiles SET mode='development'`;const results=await Promise.all([dispatchSupplierOrder(db,so.id,config),dispatchSupplierOrder(db,so.id,config)]);expect(results.map(r=>r.status).sort()).toEqual(['ineligible','simulated']);});
 it('claims one live submission, records Salla linkage and queues one coordinator notice',async()=>{
  await mapped();await db.$executeRaw`UPDATE supplier_integration_profiles SET mode='live'`;await db.$executeRaw`UPDATE commerce_suppliers SET store_coordinator_phone='+966511111111'`;
  const order=await newOrder('fixture-live-order');const claim=await claimPaymentAttempt(db,{memberId:5n,orderId:order.id,provider:'fixture'});if(!claim.claimed)throw new Error();
  await recordPaymentReference(db,{attemptId:claim.attempt.id,claimToken:claim.claimToken,reference:'fixture-live-ref'});
  await settleVerifiedPayment(db,{verified:true,status:'paid',provider:'fixture',reference:'fixture-live-ref',merchantOrderId:claim.attempt.merchantOrderId,amountMinor:9400,currency:'SAR'},[]);
  const [so]=await db.$queryRaw<{id:bigint}[]>`SELECT id FROM supplier_orders`;
  const factory=vi.fn().mockResolvedValue({createOrder:vi.fn().mockResolvedValue({status:'submitted',externalOrderId:'9001',externalOrderUrl:'https://s.salla.sa/orders/order/fixture',externalCustomerId:'77'})});
  expect(await dispatchSupplierOrder(db,so.id,liveConfig,factory as never)).toEqual({status:'submitted'});
  expect(await dispatchSupplierOrder(db,so.id,liveConfig,factory as never)).toEqual({status:'ineligible'});
  expect(factory).toHaveBeenCalledOnce();
  expect((await db.$queryRaw<{status:string;external_order_id:string;external_order_url:string;external_customer_id:string}[]>`SELECT status,external_order_id,external_order_url,external_customer_id FROM supplier_orders`)[0]).toEqual({status:'submitted',external_order_id:'9001',external_order_url:'https://s.salla.sa/orders/order/fixture',external_customer_id:'77'});
  expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM supplier_order_sync_attempts`)[0].n).toBe(1n);
  expect((await db.$queryRaw<{recipient:string;status:string}[]>`SELECT recipient,status FROM supplier_coordinator_notifications`)[0]).toEqual({recipient:'+966511111111',status:'pending'});
  const send=vi.fn().mockResolvedValue({providerMessageId:'sandbox-message-1'});
  expect(await deliverCoordinatorNotifications(db,{channel:'sms',send})).toBe(1);
  expect(await deliverCoordinatorNotifications(db,{channel:'sms',send})).toBe(0);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({recipient:'+966511111111',deduplicationKey:`trbhh:supplier-order:${so.id}:order_submitted`,message:expect.stringContaining('طلب سلة #9001')}));
  expect((await db.$queryRaw<{status:string;provider_message_id:string}[]>`SELECT status,provider_message_id FROM supplier_coordinator_notifications`)[0]).toEqual({status:'sent',provider_message_id:'sandbox-message-1'});
 });
 it('releases unpaid reservations without consuming them',async()=>{await mapped();const order=await newOrder('fixture-order-key-2');await cancelUnstartedOrder(db,{memberId:5n,orderId:order.id});const [r]=await db.$queryRaw<{remaining_quantity:number;held_quantity:number}[]>`SELECT remaining_quantity,held_quantity FROM supplier_stock_reservations`;expect(r).toEqual({remaining_quantity:50,held_quantity:0});});
 it('blocks disabled products even if legacy commerce flag was left on',async()=>{await mapped();await db.$executeRaw`UPDATE supplier_products SET active=0`;await expect(newOrder('fixture-order-key-3')).rejects.toThrow('supplier_product_unavailable');});
 it('checks actual checkout selling price against cost, not stale imported price',async()=>{await mapped();await db.$executeRaw`UPDATE commerce_products SET price_minor=3000`;await expect(newOrder('fixture-order-key-4')).rejects.toThrow('supplier_price_below_minimum');});
 it('rejects variants introduced after activation',async()=>{await mapped();await db.$executeRaw`UPDATE supplier_products SET options=${JSON.stringify([{externalId:'1',name:'Size',values:['M']}])}`;await expect(newOrder('fixture-order-key-5')).rejects.toThrow('supplier_variant_checkout_required');});
 it('splits remaining reserved units and snapshots exact payable',async()=>{await mapped();await db.$executeRaw`UPDATE supplier_stock_reservations SET quantity=1,remaining_quantity=1`;await newOrder('fixture-order-key-6');const [so]=await db.$queryRaw<{payable_minor:number;profit_minor:number;request_snapshot:unknown}[]>`SELECT payable_minor,profit_minor,request_snapshot FROM supplier_orders`;expect(so.payable_minor).toBe(7500);expect(so.profit_minor).toBe(1900);const request=typeof so.request_snapshot==='string'?JSON.parse(so.request_snapshot):so.request_snapshot;expect(request).toMatchObject({items:[{quantity:1,unitCostMinor:3500},{quantity:1,unitCostMinor:4000}]});});
 it('ambiguous refresh requires reconnect and never reuses old refresh token',async()=>{await db.$executeRaw`UPDATE supplier_connections SET expires_at=${new Date(Date.now()-1000)}`;const fetcher=vi.fn().mockRejectedValue(new Error('provider-secret-must-not-leak'));await expect(accessTokenForConnection(db,1n,config,fetcher)).rejects.toThrow('supplier_reconnect_required');await expect(accessTokenForConnection(db,1n,config,fetcher)).rejects.toThrow('supplier_connection_unavailable');expect(fetcher).toHaveBeenCalledTimes(1);expect((await db.$queryRaw<{encrypted_tokens:string|null}[]>`SELECT encrypted_tokens FROM supplier_connections`)[0].encrypted_tokens).toBeNull();});
 async function shippingNoticeFixture(){
  await mapped();const order=await newOrder('shipping-notice-order');
  const attempt=await claimPaymentAttempt(db,{memberId:5n,orderId:order.id,provider:'fixture'});if(!attempt.claimed)throw new Error('fixture_claim');
  await recordPaymentReference(db,{attemptId:attempt.attempt.id,claimToken:attempt.claimToken,reference:'shipping-notice-ref'});
  await settleVerifiedPayment(db,{verified:true,status:'paid',provider:'fixture',reference:'shipping-notice-ref',merchantOrderId:attempt.attempt.merchantOrderId,amountMinor:9400,currency:'SAR'},[]);
  await db.$executeRaw`INSERT INTO commerce_notifications(order_id,event,channel,recipient,payload) VALUES(${order.id},'ship:fixture','in_app','member:5',${JSON.stringify({secret:'never-copy-provider-payload'})})`;
  return order;
 }
 it('delivers shipping notices to the legacy inbox atomically and once under concurrency',async()=>{
  const order=await shippingNoticeFixture();
  await db.$executeRaw`INSERT INTO site_settings(k,v) VALUES('supplier_tracking_notice','تحديث شحن مخصص')`;
  await db.$executeRaw`INSERT INTO notfications(title,route,user_id,type) VALUES('Existing notice','/account','6','other')`;
  const results=await Promise.all([deliverSupplierNotices(db,20),deliverSupplierNotices(db,20)]);expect(results.reduce((a,b)=>a+b,0)).toBe(1);
  expect(await deliverSupplierNotices(db,20)).toBe(0);
  const notices=await db.$queryRaw<{title:string;route:string;user_id:string;type:string;read_at:Date|null}[]>`SELECT title,route,user_id,type,read_at FROM notfications ORDER BY id`;
  expect(notices).toEqual([{title:'Existing notice',route:'/account',user_id:'6',type:'other',read_at:null},{title:'تحديث شحن مخصص',route:'/account/orders/'+order.id,user_id:'5',type:'other',read_at:null}]);
  expect((await db.$queryRaw<{status:string}[]>`SELECT status FROM commerce_notifications WHERE event='ship:fixture'`)[0].status).toBe('sent');
 });
 it('notice bridge excludes mismatched recipients, non-shipping events, unpaid orders and missing receipts',async()=>{
  const order=await shippingNoticeFixture();
  await db.$executeRaw`UPDATE commerce_notifications SET recipient='member:6' WHERE event='ship:fixture'`;expect(await deliverSupplierNotices(db)).toBe(0);
  await db.$executeRaw`UPDATE commerce_notifications SET recipient='member:5',event='not_shipping' WHERE event='ship:fixture'`;expect(await deliverSupplierNotices(db)).toBe(0);
  await db.$executeRaw`UPDATE commerce_notifications SET event='ship:fixture' WHERE event='not_shipping'`;
  await db.$executeRaw`UPDATE commerce_orders SET status='awaiting_payment' WHERE id=${order.id}`;expect(await deliverSupplierNotices(db)).toBe(0);
  await db.$executeRaw`UPDATE commerce_orders SET status='paid' WHERE id=${order.id}`;await db.$executeRaw`DELETE FROM commerce_receipts WHERE order_id=${order.id}`;expect(await deliverSupplierNotices(db)).toBe(0);
  expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM notfications`)[0].n).toBe(0n);
 });
 it('notice insertion rolls back if outbox transition fails; retry delivers only once',async()=>{
  await shippingNoticeFixture();
  await db.$executeRawUnsafe("ALTER TABLE commerce_notifications ADD CONSTRAINT fixture_notice_failure CHECK (status <> 'sent')");
  try{
   await expect(deliverSupplierNotices(db)).rejects.toThrow();
   expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM notfications`)[0].n).toBe(0n);
   expect((await db.$queryRaw<{status:string}[]>`SELECT status FROM commerce_notifications WHERE event='ship:fixture'`)[0].status).toBe('pending');
  }finally{await db.$executeRawUnsafe('ALTER TABLE commerce_notifications DROP CHECK fixture_notice_failure');}
  expect(await deliverSupplierNotices(db)).toBe(1);expect(await deliverSupplierNotices(db)).toBe(0);
  expect((await db.$queryRaw<{title:string}[]>`SELECT title FROM notfications`)[0].title).toBe('يوجد تحديث على شحن طلبك. راجع تفاصيل الطلب.');
 });
  const enqueue=(key:string,event='product.updated',resourceId='10',kind:'product'|'order'='product')=>receiveSallaEvent(db,{key,event,merchant:'999',resourceId,occurredAt:new Date().toISOString(),kind});
  const identityResponse=()=>new Response(JSON.stringify({success:true,data:{merchant:{id:999,name:'Fixture supplier',domain:'https://fixture.salla.sa'}}}));
  const sourceResponse=()=>new Response(JSON.stringify({success:true,data:{id:10,name:'Fresh fixture',sku:'fixture',price:{amount:50,currency:'SAR'},quantity:20,status:'sale',is_available:true,images:[]}}));
 it('worker claims once concurrently and imports the authoritative product',async()=>{
  await enqueue('worker-concurrent');let signal!:()=>void,release!:()=>void;
  const started=new Promise<void>(r=>{signal=r;}),wait=new Promise<void>(r=>{release=r;});
   const fetcher=vi.fn(async(input:RequestInfo|URL)=>{if(String(input).includes('/oauth2/user/info'))return identityResponse();signal();await wait;return sourceResponse();});
  const first=processNextSupplierEvent(db,config,fetcher);await started;
  try{expect(await processNextSupplierEvent(db,config,fetcher)).toBe('empty');}finally{release();}
   expect(await first).toBe('done');expect(fetcher).toHaveBeenCalledTimes(2);
  expect((await db.$queryRaw<{status:string;attempts:number}[]>`SELECT status,attempts FROM supplier_webhook_events`)[0]).toEqual({status:'done',attempts:1});
  expect((await db.$queryRaw<{name:string;active:number;visible:number}[]>`SELECT name,active,visible FROM supplier_products`)[0]).toEqual({name:'Fresh fixture',active:0,visible:0});
 });
 it('failed GET backs off without leaking diagnostics, then stale claim recovers',async()=>{
  await enqueue('worker-failure');const bad=vi.fn().mockRejectedValue(new Error('secret-provider-body'));
  expect(await processNextSupplierEvent(db,config,bad)).toBe('failed');
  expect(await processNextSupplierEvent(db,config,bad)).toBe('empty');expect(bad).toHaveBeenCalledTimes(1);
  expect((await db.$queryRaw<{last_error:string;future:bigint}[]>`SELECT last_error,next_attempt_at>UTC_TIMESTAMP(3) AS future FROM supplier_webhook_events`)[0]).toEqual({last_error:'supplier_event_retry',future:1n});
  await db.$executeRaw`UPDATE supplier_webhook_events SET status='processing',claim_token='00000000-0000-4000-8000-000000000099',claimed_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 6 MINUTE)`;
   expect(await processNextSupplierEvent(db,config,vi.fn(async(input:RequestInfo|URL)=>String(input).includes('/oauth2/user/info')?identityResponse():sourceResponse()))).toBe('done');
  expect((await db.$queryRaw<{attempts:number;claim_token:string|null}[]>`SELECT attempts,claim_token FROM supplier_webhook_events`)[0]).toEqual({attempts:2,claim_token:null});
 });
 it('worker missing product closes stock but preserves administrator publication flags',async()=>{
  await mapped();await enqueue('worker-deletion','product.deleted');
   expect(await processNextSupplierEvent(db,config,vi.fn(async(input:RequestInfo|URL)=>String(input).includes('/oauth2/user/info')?identityResponse():new Response('',{status:404})))).toBe('done');
  expect((await db.$queryRaw<{available:number;active:number;visible:number}[]>`SELECT available,active,visible FROM supplier_products`)[0]).toEqual({available:0,active:1,visible:1});
  expect((await db.$queryRaw<{stock_available:number;enabled:number}[]>`SELECT stock_available,enabled FROM commerce_products`)[0]).toEqual({stock_available:0,enabled:1});
 });
 it('admin duplicate reservation submission is exactly once and mismatched replay rolls back',async()=>{
  await upsertSourceProduct(db,1n,product);const [p]=await db.$queryRaw<{id:bigint}[]>`SELECT id FROM supplier_products`;
  const form=new FormData();for(const [key,value] of Object.entries({productId:String(p.id),quantity:'4',cost:'35',kind:'prepaid',submissionKey:'00000000-0000-4000-8000-000000000022'}))form.set(key,value);
  await Promise.all([addPriceTier(db,form,5n),addPriceTier(db,form,5n)]);
  expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM supplier_stock_reservations`)[0].n).toBe(1n);
  expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM admin_log`)[0].n).toBe(1n);
  form.set('quantity','5');await expect(addPriceTier(db,form,5n)).rejects.toThrow('supplier_submission_conflict');
  expect((await db.$queryRaw<{quantity:number;remaining_quantity:number}[]>`SELECT quantity,remaining_quantity FROM supplier_stock_reservations`)[0]).toEqual({quantity:4,remaining_quantity:4});
 });
 it('concurrent checkout cannot oversell final commerce stock or reservation units',async()=>{
  await mapped();await db.$executeRaw`UPDATE commerce_products SET stock_available=2`;await db.$executeRaw`UPDATE supplier_stock_reservations SET quantity=2,remaining_quantity=2`;
  const results=await Promise.allSettled([newOrder('concurrent-order-01'),newOrder('concurrent-order-02')]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect((await db.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products`)[0]).toEqual({stock_available:0,stock_reserved:2});
  expect((await db.$queryRaw<{remaining_quantity:number;held_quantity:number}[]>`SELECT remaining_quantity,held_quantity FROM supplier_stock_reservations`)[0]).toEqual({remaining_quantity:2,held_quantity:2});
  expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM supplier_reservation_allocations`)[0].n).toBe(1n);
 });
 it('cancellation after source stock drops releases only the remaining source availability',async()=>{
  await mapped();
  const order=await createOrder(db,{memberId:5n,requestKey:'stock-drop-cancel-01',items:[{productId:1n,quantity:5}],shipping},{shippingFeeMinor:0});
  await upsertSourceProduct(db,1n,{...product,quantity:1});
  expect((await db.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`)[0]).toEqual({stock_available:0,stock_reserved:5});
  await cancelUnstartedOrder(db,{memberId:5n,orderId:order.id});
  expect((await db.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`)[0]).toEqual({stock_available:1,stock_reserved:0});
  await expect(createOrder(db,{memberId:5n,requestKey:'stock-drop-reorder-01',items:[{productId:1n,quantity:5}],shipping},{shippingFeeMinor:0})).rejects.toThrow();
  expect((await db.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=1`)[0]).toEqual({stock_available:1,stock_reserved:0});
 });
 it('failed price guard rolls back holds and order rows atomically',async()=>{
  await mapped();await db.$executeRaw`UPDATE commerce_products SET price_minor=1`;await expect(newOrder('failed-lifecycle-01')).rejects.toThrow('supplier_price_below_minimum');
  expect((await db.$queryRaw<{held_quantity:number}[]>`SELECT held_quantity FROM supplier_stock_reservations`)[0].held_quantity).toBe(0);
  expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM commerce_orders`)[0].n).toBe(0n);
  expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM supplier_orders`)[0].n).toBe(0n);
 });
 it('concurrent successful orders share the final discounted batch without double allocation',async()=>{
  await mapped();await db.$executeRaw`UPDATE supplier_stock_reservations SET quantity=2,remaining_quantity=2`;
  const orders=await Promise.all([newOrder('concurrent-batch-01'),newOrder('concurrent-batch-02')]);expect(orders).toHaveLength(2);
  const costs=await db.$queryRaw<{payable_minor:number}[]>`SELECT payable_minor FROM supplier_orders ORDER BY payable_minor`;
  expect(costs.map(row=>row.payable_minor)).toEqual([7000,8000]);
  expect((await db.$queryRaw<{held_quantity:number;remaining_quantity:number}[]>`SELECT held_quantity,remaining_quantity FROM supplier_stock_reservations`)[0]).toEqual({held_quantity:2,remaining_quantity:2});
  expect(String((await db.$queryRaw<{quantity:unknown}[]>`SELECT SUM(quantity) AS quantity FROM supplier_reservation_allocations`)[0].quantity)).toBe('2');
  expect((await db.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products`)[0]).toEqual({stock_available:96,stock_reserved:4});
 });
 it('tracking worker deduplicates shipments/notices, isolates owners and never changes payment',async()=>{
  await mapped();const local=await newOrder('tracking-lifecycle-01');
  await db.$executeRaw`UPDATE supplier_orders SET external_order_id='88',status='submitted',payment_status='unpaid' WHERE order_id=${local.id}`;
  const source={externalId:'88',status:'in_progress',paymentStatus:'paid',currency:'SAR' as const,payableMinor:9400,sourceUpdatedAt:null,shipments:[{externalId:'90',carrier:'DHL',trackingNumber:'FIXTURE-TRACK',status:'in_transit',fulfillmentStatus:'shipped',sourceUpdatedAt:'2026-09-19T10:00:00Z'}]};
  await Promise.all([recordSupplierTracking(db,1n,source),recordSupplierTracking(db,1n,source)]);
  await recordSupplierTracking(db,1n,{...source,shipments:[{...source.shipments[0],status:'creating',sourceUpdatedAt:'2026-09-18T10:00:00Z'}]});
   const fetcher=vi.fn(async(input:RequestInfo|URL)=>String(input).includes('/oauth2/user/info')?identityResponse():new Response(JSON.stringify(String(input).includes('/shipments?')?{success:true,data:[{id:90,order_id:88,courier_name:'DHL',tracking_number:'FIXTURE-TRACK',status:'in_transit',updated_at:'2026-09-19T10:00:00Z'}],pagination:{currentPage:1,totalPages:1}}:{success:true,data:{id:88,status:{slug:'in_progress'},currency:'SAR',amounts:{total:{amount:94,currency:'SAR'}},shipping_status:'shipped'}})));
  await enqueue('tracking-worker','order.updated','88','order');expect(await processNextSupplierEvent(db,config,fetcher)).toBe('done');
  const owned=await memberOrderTracking(db,local.id,5n);expect(owned).toHaveLength(1);expect(owned[0]).toMatchObject({trackingNumber:'FIXTURE-TRACK',status:'in_transit'});expect(await memberOrderTracking(db,local.id,6n)).toEqual([]);expect(JSON.stringify(owned)).not.toMatch(/supplier|cost|payable/);
  expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM supplier_shipments`)[0].n).toBe(1n);
  expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM commerce_notifications WHERE channel='in_app' AND recipient='member:5'`)[0].n).toBe(1n);
  expect((await db.$queryRaw<{status:string}[]>`SELECT status FROM commerce_orders`)[0].status).toBe('awaiting_payment');
  expect((await db.$queryRaw<{payment_status:string}[]>`SELECT payment_status FROM supplier_orders`)[0].payment_status).toBe('unpaid');
  expect((await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM commerce_receipts`)[0].n).toBe(0n);
 });
});
