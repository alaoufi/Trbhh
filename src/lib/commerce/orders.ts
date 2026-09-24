import 'server-only';
import {createHash, randomUUID} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {checkedMoney, lineTotal, sumMoney, MAX_MONEY_MINOR} from './money';
import {assertCommerceSchemaReady} from './schema';
import {reserveSupplierCost,finishSupplierReservations,capReleasedSupplierStock,type CostLine} from '@/lib/suppliers/reservations';
import {snapshotSupplierOrders} from '@/lib/suppliers/orders';
import {readApprovedFiscalPolicy} from '@/lib/finance/fiscal-policy';
import {buildOrderFiscalSnapshot,quoteFiscalProduct,quoteFiscalShipping,saveOrderFiscalSnapshot,requireOrderFiscalPolicyAtPayment} from '@/lib/finance/order-fiscal-snapshot';
import type {CalculatedFiscalLineV2} from '@/lib/finance/types';
import {formatAddressLine,normalizeSaudiAddress} from './addresses';
import type {AttemptStatus, CommerceDb, CreateOrderInput, ExpectedPayment, NotificationChannel, NotificationTarget, OrderLineInput, OrderPolicy, OrderSnapshot, OrderStatus, PaymentAttempt, PaymentClaim, ShippingSnapshot, VerifiedPayment} from './types';
import {chosenVariantSnapshot} from './variant-snapshot';

type Tx = Prisma.TransactionClient;
type OrderRow = {id:bigint;member_id:bigint;created_at:Date;request_fingerprint:string;status:OrderStatus;currency:'SAR';subtotal_minor:number;shipping_fee_minor:number;total_minor:number;shipping:ShippingSnapshot|string};
type AttemptRow = {id:bigint;order_id:bigint;provider:string;provider_ref:string|null;redirect_url:string|null;merchant_order_id:string;claim_token:string;amount_minor:number;currency:'SAR';status:AttemptStatus};
const transactionOptions={maxWait:10000,timeout:20000};
function id(value:bigint):void {
  if(typeof value!=='bigint'||value<=0n||value>18446744073709551615n) throw new Error('invalid_id');
}
function identifier(value:string,max:number):void {
  if(typeof value!=='string'||!value.length||value.length>max||!/^[\x21-\x7e]+$/.test(value)) throw new Error('invalid_identifier');
}
export function normalizeOrderRequest(input:readonly unknown[]):OrderLineInput[] {
  if(!Array.isArray(input)||!input.length||input.length>100) throw new Error('invalid_items');
  const quantities=new Map<string,OrderLineInput>();
  for(const raw of input) {
    if(!raw||typeof raw!=='object'||!['productId,quantity','productId,quantity,variantKey'].includes(Object.keys(raw).sort().join(','))) throw new Error('invalid_items');
    const item=raw as OrderLineInput;
    id(item.productId);lineTotal(0,item.quantity);
    if(item.variantKey!==undefined&&(typeof item.variantKey!=='string'||!item.variantKey.trim()||item.variantKey.length>191||/[\u0000-\u001f\u007f]/.test(item.variantKey)))throw new Error('invalid_items');
    const key=item.productId.toString(),prior=quantities.get(key);
    if(prior&&prior.variantKey!==item.variantKey)throw new Error('duplicate_product_variant');
    const quantity=(prior?.quantity||0)+item.quantity;
    lineTotal(0,quantity);quantities.set(key,{productId:item.productId,quantity,...(item.variantKey?{variantKey:item.variantKey}:{})});
  }
  return [...quantities.values()].sort((a,b)=>a.productId<b.productId?-1:a.productId>b.productId?1:0);
}
function shippingSnapshot(input:ShippingSnapshot):ShippingSnapshot {
  const keys=['addressLine','alternatePhone','buildingNumber','city','country','deliveryNotes','district','email','name','phone','postalCode','region','secondaryNumber','shortAddress','street'];
  if(!input||typeof input!=='object'||Object.keys(input).sort().join(',')!==keys.sort().join(','))throw new Error('invalid_shipping');
  try{
    const normalized=normalizeSaudiAddress({label:'عنوان الطلب',fullName:input.name,phone:input.phone,alternatePhone:input.alternatePhone||'',email:input.email||'',country:input.country,region:input.region||'',city:input.city,district:input.district||'',street:input.street||'',buildingNumber:input.buildingNumber||'',secondaryNumber:input.secondaryNumber||'',postalCode:input.postalCode,shortAddress:input.shortAddress||'',deliveryNotes:input.deliveryNotes||''});
    if(input.addressLine!==formatAddressLine(normalized))throw new Error('invalid_shipping');
    return {name:normalized.fullName,phone:normalized.phone,addressLine:input.addressLine,city:normalized.city,postalCode:normalized.postalCode,country:'SA',region:normalized.region,district:normalized.district,street:normalized.street,buildingNumber:normalized.buildingNumber,secondaryNumber:normalized.secondaryNumber,alternatePhone:normalized.alternatePhone,email:normalized.email,shortAddress:normalized.shortAddress,deliveryNotes:normalized.deliveryNotes};
  }catch(error){throw error instanceof Error&&error.message.startsWith('address_')?error:new Error('invalid_shipping');}
}
export function requestFingerprint(items:readonly OrderLineInput[],shipping?:ShippingSnapshot):string {
  const normalized=normalizeOrderRequest(items).map(item=>({productId:item.productId.toString(),quantity:item.quantity,variantKey:item.variantKey||null}));
  return createHash('sha256').update(JSON.stringify({version:1,items:normalized,shipping:shipping?shippingSnapshot(shipping):null})).digest('hex');
}
export function paymentMatches(expected:ExpectedPayment,evidence:VerifiedPayment):boolean {
  return evidence.verified===true && evidence.status==='paid'
    && Number.isSafeInteger(evidence.amountMinor) && evidence.amountMinor>0
    && evidence.amountMinor===expected.amountMinor && evidence.currency==='SAR' && expected.currency==='SAR'
    && !!expected.reference && evidence.reference===expected.reference
    && !!expected.merchantOrderId && evidence.merchantOrderId===expected.merchantOrderId
    && !!expected.provider && evidence.provider===expected.provider;
}
export function normalizeRecipients(input:readonly {recipient:string;channel:string}[]):NotificationTarget[] {
  if(!Array.isArray(input)||input.length>50) throw new Error('invalid_recipients');
  const output=new Map<string,NotificationTarget>();
  for(const target of input) {
    if(!target||!['in_app','sms','whatsapp','email','push'].includes(target.channel)||typeof target.recipient!=='string'||!target.recipient.trim()||target.recipient!==target.recipient.trim()||target.recipient.length>191||/[\u0000-\u001f\u007f]/.test(target.recipient)) throw new Error('invalid_recipients');
    output.set(JSON.stringify([target.channel,target.recipient]),{recipient:target.recipient,channel:target.channel as NotificationChannel});
  }
  return [...output.values()];
}
async function readOrder(tx:Tx,row:OrderRow):Promise<OrderSnapshot> {
  const items=await tx.$queryRaw<{product_id:bigint;title:string;quantity:number;unit_price_minor:number;list_unit_price_minor:number|null;discount_minor:number;total_minor:number;variant_snapshot:unknown}[]>`SELECT product_id,title,quantity,unit_price_minor,list_unit_price_minor,discount_minor,total_minor,variant_snapshot FROM commerce_order_items WHERE order_id=${row.id} ORDER BY product_id`;
  return {id:row.id,memberId:row.member_id,status:row.status,currency:row.currency,subtotalMinor:row.subtotal_minor,shippingFeeMinor:row.shipping_fee_minor,totalMinor:row.total_minor,shipping:typeof row.shipping==='string'?JSON.parse(row.shipping):row.shipping,items:items.map(item=>({productId:item.product_id,title:item.title,quantity:item.quantity,unitPriceMinor:item.unit_price_minor,totalMinor:item.total_minor,listUnitPriceMinor:item.list_unit_price_minor,discountMinor:item.discount_minor,variantSnapshot:item.variant_snapshot?(typeof item.variant_snapshot==='string'?JSON.parse(item.variant_snapshot):item.variant_snapshot) as import('./types').ChosenVariantSnapshot:null}))};
}
function attemptView(row:AttemptRow):PaymentAttempt {
  return {id:row.id,orderId:row.order_id,provider:row.provider,reference:row.provider_ref,redirectUrl:row.redirect_url,merchantOrderId:row.merchant_order_id,amountMinor:row.amount_minor,currency:row.currency,status:row.status};
}

/** Auth/RBAC and fail-closed feature policy belong at the request boundary.
 * Caller supplies only trusted member ID and trusted server shipping policy.
 * Stock is reserved at order creation; no automatic expiry is inferred here. */
export async function createOrder(db:CommerceDb,input:CreateOrderInput,policy:OrderPolicy):Promise<OrderSnapshot> {
  id(input.memberId);identifier(input.requestKey,80);
  if(input.requestKey.length<16) throw new Error('invalid_request_key');
  const items=normalizeOrderRequest(input.items), shipping=shippingSnapshot(input.shipping);
  const shippingFeeMinor=checkedMoney(policy.shippingFeeMinor);
  const fingerprint=requestFingerprint(items,shipping);
  // دفاع في العمق: مفتاح الشراء المركزي fail-closed حتى لو تجاوز المُتصِل حارس الحدود.
  const [pflag]=await db.$queryRaw<{v:string|null}[]>`SELECT v FROM site_settings WHERE k='commerce_purchasing_enabled' LIMIT 1`;
  if((pflag?.v??'0')!=='1') throw new Error('purchasing_disabled');
  await assertCommerceSchemaReady(db);
  return db.$transaction(async tx=>{
    // Unique member/request key serializes concurrent replays. Building rows
    // never commit: any stock or insert failure rolls the whole transaction back.
    await tx.$executeRaw`INSERT INTO commerce_orders (member_id,request_key,request_fingerprint,shipping) VALUES (${input.memberId},${input.requestKey},${fingerprint},${JSON.stringify(shipping)}) ON DUPLICATE KEY UPDATE id=id`;
    const [row]=await tx.$queryRaw<OrderRow[]>`SELECT * FROM commerce_orders WHERE member_id=${input.memberId} AND request_key=${input.requestKey} FOR UPDATE`;
    if(!row||row.request_fingerprint!==fingerprint) throw new Error('request_conflict');
    if(row.status!=='building') return readOrder(tx,row);
    const fiscalPolicy=await readApprovedFiscalPolicy(tx,row.created_at);
    const fiscalLines:CalculatedFiscalLineV2[]=[];
    const totals:number[]=[];
    const supplierCostLines=new Map<string,CostLine[]>();
    for(const item of items) {
      const [product]=await tx.$queryRaw<{id:bigint;title:string;price_minor:number;currency:string;stock_available:number;stock_reserved:number;approved:number;visible:number;enabled:number}[]>`SELECT id,title,price_minor,currency,stock_available,stock_reserved,approved,visible,enabled FROM commerce_products WHERE id=${item.productId} FOR UPDATE`;
      if(!product||product.approved!==1||product.visible!==1||product.enabled!==1||product.currency!=='SAR'||product.price_minor<=0||product.stock_available<item.quantity) throw new Error('product_unavailable');
      const [sourceVariant]=await tx.$queryRaw<{variants:unknown;options:unknown}[]>`SELECT variants,options FROM supplier_products WHERE commerce_product_id=${item.productId} FOR SHARE`;
      let sourceVariantValue:unknown=sourceVariant?.variants;try{if(typeof sourceVariantValue==='string')sourceVariantValue=JSON.parse(sourceVariantValue);}catch{sourceVariantValue=null;}
      let sourceOptionsValue:unknown=sourceVariant?.options;try{if(typeof sourceOptionsValue==='string')sourceOptionsValue=JSON.parse(sourceOptionsValue);}catch{sourceOptionsValue=null;}
      const sourceVariants=Array.isArray(sourceVariantValue)?sourceVariantValue:[];
      if(!item.variantKey){
        const [cjRequired]=await tx.$queryRaw<{details_json:unknown}[]>`SELECT details_json FROM cj_products WHERE commerce_product_id=${item.productId} AND hidden=0 AND status='ready' ORDER BY id LIMIT 1 FOR SHARE`;
        let cjDetails:unknown=cjRequired?.details_json;try{if(typeof cjDetails==='string')cjDetails=JSON.parse(cjDetails);}catch{cjDetails=null;}
        const cjVariantRows=cjDetails&&typeof cjDetails==='object'?(cjDetails as Record<string,unknown>).variants:null;
        if(Array.isArray(cjVariantRows)&&cjVariantRows.length>0)throw new Error('product_variant_required');
      }
      const selectedVariantKey=item.variantKey||'';
      let rawVariant=selectedVariantKey?sourceVariants.find(raw=>raw&&typeof raw==='object'&&[String((raw as Record<string,unknown>).externalId||''),String((raw as Record<string,unknown>).vid||''),String((raw as Record<string,unknown>).id||'')].includes(selectedVariantKey)):undefined;
      let cjVariantFound=false;
      if(selectedVariantKey&&!rawVariant){
        const [cjSource]=await tx.$queryRaw<{details_json:unknown;availability_json:unknown;availability_checked_at:Date|null}[]>`SELECT details_json,availability_json,availability_checked_at FROM cj_products WHERE commerce_product_id=${item.productId} AND hidden=0 AND status='ready' ORDER BY availability_checked_at DESC,id LIMIT 1 FOR SHARE`;
        const decode=(value:unknown)=>{if(typeof value!=='string')return value;try{return JSON.parse(value) as unknown;}catch{return null;}};
        const detail=decode(cjSource?.details_json),availability=decode(cjSource?.availability_json),detailVariants=detail&&typeof detail==='object'&&Array.isArray((detail as Record<string,unknown>).variants)?(detail as Record<string,unknown>).variants as unknown[]:[];
        const data=availability&&typeof availability==='object'?availability as Record<string,unknown>:null;
        const checkedAt=cjSource?.availability_checked_at;
        const isFresh=!!checkedAt&&checkedAt.getTime()<=Date.now()&&Date.now()-checkedAt.getTime()<=6*60*60*1000&&Array.isArray(data?.shippingOptions)&&data!.shippingOptions.length>0;
        const raw=detailVariants.find(value=>value&&typeof value==='object'&&String((value as Record<string,unknown>).vid||'')===selectedVariantKey);
        const stockRows=Array.isArray(data?.variants)?data!.variants as Record<string,unknown>[]:[];
        const stock=Number(stockRows.find(value=>String(value.vid||'')===selectedVariantKey)?.stockQuantity||0);
        if(isFresh&&raw&&Number.isSafeInteger(stock)&&stock>=item.quantity){rawVariant={...(raw as Record<string,unknown>),quantity:stock,available:true,publicPriceMinor:product.price_minor};cjVariantFound=true;}
        else if(raw)throw new Error('product_variant_unavailable');
      }
      const needsVariant=sourceVariants.length>0||cjVariantFound||Array.isArray(sourceOptionsValue)&&sourceOptionsValue.length>0;
      if((needsVariant&&!rawVariant)||(!needsVariant&&selectedVariantKey))throw new Error('product_variant_required');
      const chosen=rawVariant?chosenVariantSnapshot(selectedVariantKey,rawVariant):null;
      if(rawVariant&&!chosen)throw new Error('product_variant_invalid');
      const variantData=rawVariant as Record<string,unknown>|undefined;
      const variantStock=Number(variantData?.quantity??variantData?.stock);
      if(variantData&&(variantData.available!==true||!Number.isSafeInteger(variantStock)||variantStock<item.quantity))throw new Error('product_variant_unavailable');
      const variantPrice=Number(variantData?.publicPriceMinor??variantData?.priceMinor??product.price_minor);
      if(!Number.isSafeInteger(variantPrice)||variantPrice<=0)throw new Error('product_variant_price_invalid');
      const unitPriceMinor=variantPrice;
      const possibleListPrice=Number(variantData?.originalPriceMinor),listUnitPriceMinor=Number.isSafeInteger(possibleListPrice)&&possibleListPrice>unitPriceMinor?possibleListPrice:unitPriceMinor;
      const discountMinor=checkedMoney((listUnitPriceMinor-unitPriceMinor)*item.quantity);
      checkedMoney(product.stock_available);checkedMoney(product.stock_reserved+item.quantity);
      const fiscalLine=quoteFiscalProduct(fiscalPolicy,{key:String(item.productId),title:product.title,quantity:item.quantity,unitPriceMinor:listUnitPriceMinor,discountMinor});
      if(chosen)fiscalLine.variantSnapshot=chosen;
      const total=checkedMoney(fiscalLine.grossMinor);totals.push(total);
      await tx.$executeRaw`UPDATE commerce_products SET stock_available=stock_available-${item.quantity},stock_reserved=stock_reserved+${item.quantity},updated_at=CURRENT_TIMESTAMP(3) WHERE id=${item.productId}`;
      await tx.$executeRaw`INSERT INTO commerce_order_items (order_id,product_id,title,quantity,unit_price_minor,list_unit_price_minor,discount_minor,total_minor,variant_key,variant_snapshot) VALUES (${row.id},${item.productId},${product.title},${item.quantity},${unitPriceMinor},${listUnitPriceMinor>unitPriceMinor?listUnitPriceMinor:null},${discountMinor},${total},${item.variantKey??''},${chosen?JSON.stringify(chosen):null})`;
      // Lock mapping (including its absent-key gap) and profile while snapshotting.
      // Never accept supplier identity/cost from checkout input.
      const [mapping]=await tx.$queryRaw<{supplier_id:bigint;supplier_sku:string;unit_cost_minor:number;currency:string}[]>`SELECT supplier_id,supplier_sku,unit_cost_minor,currency FROM commerce_product_suppliers WHERE product_id=${item.productId} FOR UPDATE`;
      if(mapping) {
        const [supplier]=await tx.$queryRaw<{name:string;active:number}[]>`SELECT name,active FROM commerce_suppliers WHERE id=${mapping.supplier_id} FOR SHARE`;
        if(!supplier||supplier.active!==1) throw new Error('supplier_unavailable');
        if(mapping.currency!=='SAR') throw new Error('supplier_currency_invalid');
        const cost=await reserveSupplierCost(tx,row.id,item.productId,mapping.supplier_id,item.quantity,mapping.unit_cost_minor,unitPriceMinor);
        supplierCostLines.set(String(item.productId),cost.lines);
        await tx.$executeRaw`INSERT INTO commerce_order_suppliers (order_id,product_id,supplier_id,supplier_name,supplier_sku,quantity,unit_cost_minor,total_cost_minor) VALUES (${row.id},${item.productId},${mapping.supplier_id},${supplier.name},${mapping.supplier_sku},${item.quantity},${cost.unitCostMinor},${cost.totalCostMinor})`;
        fiscalLine.supplierId=String(mapping.supplier_id);fiscalLine.supplierMinor=cost.totalCostMinor;
      }
      fiscalLines.push(fiscalLine);
    }
    const shippingLine=quoteFiscalShipping(fiscalPolicy,shippingFeeMinor),payableShipping=checkedMoney(shippingLine.grossMinor);
    fiscalLines.push(shippingLine);
    const fiscalSnapshot=buildOrderFiscalSnapshot(row.id,row.created_at,fiscalPolicy,shipping,fiscalLines);
    const subtotal=sumMoney(totals), total=sumMoney([subtotal,payableShipping]);
    if(total!==fiscalSnapshot.totalMinor)throw new Error('finance_invoice_difference');
    await saveOrderFiscalSnapshot(tx,fiscalSnapshot);
    await tx.$executeRaw`UPDATE commerce_orders SET status='awaiting_payment',subtotal_minor=${subtotal},shipping_fee_minor=${payableShipping},total_minor=${total} WHERE id=${row.id}`;
    await snapshotSupplierOrders(tx,row.id,shipping,supplierCostLines);
    await tx.$executeRaw`INSERT INTO commerce_audit_events (order_id,event,payload) VALUES (${row.id},'order_created',${JSON.stringify({memberId:input.memberId.toString(),totalMinor:total,currency:'SAR'})})`;
    return readOrder(tx,{...row,status:'awaiting_payment',subtotal_minor:subtotal,shipping_fee_minor:payableShipping,total_minor:total});
  },transactionOptions);
}

/** Only orders that have NEVER attempted payment can release reserved stock.
 * Lock order then attempt, matching payment creation and settlement. Unknown
 * gateway results are not evidence that a payment failed. */
export async function cancelUnstartedOrder(db:CommerceDb,input:{memberId:bigint;orderId:bigint}):Promise<{orderId:bigint;alreadyCancelled:boolean}> {
  id(input.memberId);id(input.orderId);
  await assertCommerceSchemaReady(db);
  return db.$transaction(async tx=>{
    const [order]=await tx.$queryRaw<OrderRow[]>`SELECT * FROM commerce_orders WHERE id=${input.orderId} AND member_id=${input.memberId} FOR UPDATE`;
    if(!order) throw new Error('order_not_found');
    const attempts=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_payment_attempts WHERE order_id=${order.id} FOR UPDATE`;
    if(attempts.length) throw new Error('payment_attempt_exists');
    if(order.status==='cancelled') return {orderId:order.id,alreadyCancelled:true};
    if(order.status!=='awaiting_payment') throw new Error('order_not_cancellable');
    const items=await tx.$queryRaw<{product_id:bigint;quantity:number}[]>`SELECT product_id,quantity FROM commerce_order_items WHERE order_id=${order.id} ORDER BY product_id`;
    if(!items.length) throw new Error('order_items_missing');
    for(const item of items) {
      lineTotal(0,item.quantity);
      const limit=MAX_MONEY_MINOR-item.quantity;
      const changed=await tx.$executeRaw`UPDATE commerce_products SET stock_reserved=stock_reserved-${item.quantity},stock_available=stock_available+${item.quantity},updated_at=CURRENT_TIMESTAMP(3) WHERE id=${item.product_id} AND stock_reserved>=${item.quantity} AND stock_available<=${limit}`;
      if(changed!==1) throw new Error('reservation_mismatch');
      await capReleasedSupplierStock(tx,item.product_id);
    }
    await tx.$executeRaw`UPDATE commerce_orders SET status='cancelled',fulfillment_status='cancelled' WHERE id=${order.id}`;
    await finishSupplierReservations(tx,order.id,false);
    await tx.$executeRaw`UPDATE supplier_orders SET status='cancelled',updated_at=CURRENT_TIMESTAMP(3) WHERE order_id=${order.id} AND status='awaiting_payment'`;
    await tx.$executeRaw`INSERT INTO commerce_audit_events (order_id,event,payload) VALUES (${order.id},'order_cancelled',${JSON.stringify({memberId:input.memberId.toString()})})`;
    return {orderId:order.id,alreadyCancelled:false};
  },transactionOptions);
}

/** A true result is a one-use permission to create externally. On timeout/crash,
 * the persisted attempt stays creating/uncertain; NEVER call create again. */
export async function claimPaymentAttempt(db:CommerceDb,input:{memberId:bigint;orderId:bigint;provider:string}):Promise<PaymentClaim> {
  id(input.memberId);id(input.orderId);identifier(input.provider,40);
  await assertCommerceSchemaReady(db);
  return db.$transaction(async tx=>{
    const [order]=await tx.$queryRaw<OrderRow[]>`SELECT * FROM commerce_orders WHERE id=${input.orderId} AND member_id=${input.memberId} FOR UPDATE`;
    if(!order) throw new Error('order_not_found');
    const [existing]=await tx.$queryRaw<AttemptRow[]>`SELECT * FROM commerce_payment_attempts WHERE order_id=${order.id} FOR UPDATE`;
    if(existing){
      const attempt=attemptView(existing);
      // Reusing a pending gateway URL can still start a real payment. Keep the
      // durable attempt/evidence intact, but do not re-publish an unapproved quote.
      if(attempt.status==='pending'&&attempt.redirectUrl){
        try{
          const [clock]=await tx.$queryRaw<{now:Date}[]>`SELECT UTC_TIMESTAMP(3) AS now`;
          await requireOrderFiscalPolicyAtPayment(tx,order.id,clock.now);
        }catch{return {claimed:false,attempt:{...attempt,redirectUrl:null}};}
      }
      return {claimed:false,attempt};
    }
    if(order.status!=='awaiting_payment') throw new Error('order_not_payable');
    const [clock]=await tx.$queryRaw<{now:Date}[]>`SELECT UTC_TIMESTAMP(3) AS now`;
    await requireOrderFiscalPolicyAtPayment(tx,order.id,clock.now);
    checkedMoney(order.total_minor);if(order.total_minor<=0||order.currency!=='SAR') throw new Error('order_not_payable');
    const token=randomUUID(),merchantOrderId=`commerce:${order.id}:${randomUUID()}`;
    await tx.$executeRaw`INSERT INTO commerce_payment_attempts (order_id,provider,merchant_order_id,claim_token,amount_minor,currency) VALUES (${order.id},${input.provider},${merchantOrderId},${token},${order.total_minor},'SAR')`;
    const [attempt]=await tx.$queryRaw<AttemptRow[]>`SELECT * FROM commerce_payment_attempts WHERE order_id=${order.id}`;
    return {claimed:true,claimToken:token,attempt:attemptView(attempt)};
  },transactionOptions);
}
async function lockAttempt(tx:Tx,attemptId:bigint):Promise<AttemptRow> {
  const [lookup]=await tx.$queryRaw<{order_id:bigint}[]>`SELECT order_id FROM commerce_payment_attempts WHERE id=${attemptId}`;
  if(!lookup) throw new Error('attempt_not_found');
  // All payment paths lock order then attempt, avoiding inverse lock ordering.
  await tx.$queryRaw`SELECT id FROM commerce_orders WHERE id=${lookup.order_id} FOR UPDATE`;
  const [attempt]=await tx.$queryRaw<AttemptRow[]>`SELECT * FROM commerce_payment_attempts WHERE id=${attemptId} FOR UPDATE`;
  if(!attempt) throw new Error('attempt_not_found');
  return attempt;
}
export async function recordPaymentReference(db:CommerceDb,input:{attemptId:bigint;claimToken:string;reference:string;redirectUrl?:string}):Promise<void> {
  id(input.attemptId);identifier(input.reference,160);identifier(input.claimToken,36);
  if(input.redirectUrl!==undefined) {
    let url:URL;
    try {url=new URL(input.redirectUrl);} catch {throw new Error('invalid_redirect');}
    if(typeof input.redirectUrl!=='string'||input.redirectUrl.length>2048||input.redirectUrl!==input.redirectUrl.trim()||url.protocol!=='https:'||!url.hostname||url.username||url.password||url.hash||/[\u0000-\u0020\u007f]/.test(input.redirectUrl)) throw new Error('invalid_redirect');
  }
  await assertCommerceSchemaReady(db);
  await db.$transaction(async tx=>{
    const attempt=await lockAttempt(tx,input.attemptId);
    if(attempt.claim_token!==input.claimToken) throw new Error('claim_mismatch');
    if(attempt.provider_ref && attempt.provider_ref!==input.reference) throw new Error('reference_conflict');
    if(attempt.redirect_url && input.redirectUrl!==undefined && attempt.redirect_url!==input.redirectUrl) throw new Error('redirect_conflict');
    if(attempt.status==='paid') return;
    await tx.$executeRaw`UPDATE commerce_payment_attempts SET provider_ref=${input.reference},redirect_url=${input.redirectUrl??attempt.redirect_url},status='pending' WHERE id=${attempt.id}`;
  },transactionOptions);
}
export async function markPaymentUncertain(db:CommerceDb,input:{attemptId:bigint;claimToken:string}):Promise<void> {
  id(input.attemptId);identifier(input.claimToken,36);
  await assertCommerceSchemaReady(db);
  await db.$transaction(async tx=>{
    const attempt=await lockAttempt(tx,input.attemptId);
    if(attempt.claim_token!==input.claimToken) throw new Error('claim_mismatch');
    if(attempt.status==='paid') return;
    await tx.$executeRaw`UPDATE commerce_payment_attempts SET status='uncertain' WHERE id=${attempt.id}`;
    await tx.$executeRaw`UPDATE commerce_orders SET fulfillment_status='action_required' WHERE id=${attempt.order_id}`;
  },transactionOptions);
}

/** Never pass browser-return/query/body fields directly. Authenticate/re-query
 * the provider in a separate adapter first. This service performs NO network I/O.
 * Unknown references stay unpaid until independently bound/reconciled. */
export async function settleVerifiedPayment(db:CommerceDb,evidence:VerifiedPayment,recipients:readonly NotificationTarget[]):Promise<{orderId:bigint;alreadyPaid:boolean}> {
  identifier(evidence.provider,40);identifier(evidence.reference,160);identifier(evidence.merchantOrderId,100);
  checkedMoney(evidence.amountMinor);
  if(evidence.verified!==true||evidence.status!=='paid'||evidence.currency!=='SAR') throw new Error('payment_mismatch');
  const targets=normalizeRecipients(recipients);
  await assertCommerceSchemaReady(db);
  return db.$transaction(async tx=>{
    const [lookup]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_payment_attempts WHERE merchant_order_id=${evidence.merchantOrderId}`;
    if(!lookup) throw new Error('attempt_not_found');
    const attempt=await lockAttempt(tx,lookup.id);
    const [order]=await tx.$queryRaw<OrderRow[]>`SELECT * FROM commerce_orders WHERE id=${attempt.order_id} FOR UPDATE`;
    if(!order||!paymentMatches({provider:attempt.provider,reference:attempt.provider_ref||'',merchantOrderId:attempt.merchant_order_id,amountMinor:attempt.amount_minor,currency:attempt.currency},evidence)||order.total_minor!==attempt.amount_minor||order.currency!==attempt.currency) throw new Error('payment_mismatch');
    if(attempt.status==='paid' && order.status==='paid') return {orderId:order.id,alreadyPaid:true};
    if(order.status!=='awaiting_payment'||!['pending','uncertain'].includes(attempt.status)) throw new Error('payment_state_conflict');
    const items=await tx.$queryRaw<{product_id:bigint;quantity:number}[]>`SELECT product_id,quantity FROM commerce_order_items WHERE order_id=${order.id} ORDER BY product_id`;
    if(!items.length) throw new Error('order_items_missing');
    for(const item of items) {
      const changed=await tx.$executeRaw`UPDATE commerce_products SET stock_reserved=stock_reserved-${item.quantity},updated_at=CURRENT_TIMESTAMP(3) WHERE id=${item.product_id} AND stock_reserved>=${item.quantity}`;
      if(changed!==1) throw new Error('reservation_mismatch');
    }
    await tx.$executeRaw`UPDATE commerce_payment_attempts SET status='paid',paid_at=CURRENT_TIMESTAMP(3) WHERE id=${attempt.id}`;
    await tx.$executeRaw`UPDATE commerce_orders SET status='paid',fulfillment_status='offline_pending',paid_at=CURRENT_TIMESTAMP(3) WHERE id=${order.id}`;
    await tx.$executeRaw`INSERT INTO commerce_receipts (order_id,provider,provider_ref,amount_minor,currency) VALUES (${order.id},${attempt.provider},${attempt.provider_ref},${attempt.amount_minor},'SAR')`;
    await finishSupplierReservations(tx,order.id,true);
    await tx.$executeRaw`UPDATE supplier_orders SET status='pending',payment_status='paid',updated_at=CURRENT_TIMESTAMP(3) WHERE order_id=${order.id} AND status='awaiting_payment'`;
    // Only immutable order snapshots feed the subledger: a later supplier disable
    // or product remapping must not prevent receipt of a verified historical payment.
    await tx.$executeRaw`INSERT INTO commerce_supplier_accruals (order_id,product_id,supplier_id,amount_minor,currency,status) SELECT order_id,product_id,supplier_id,total_cost_minor,'SAR','offline_pending' FROM commerce_order_suppliers WHERE order_id=${order.id}`;
    const payload=JSON.stringify({orderId:order.id.toString(),amountMinor:attempt.amount_minor,currency:'SAR',providerReference:attempt.provider_ref});
    await tx.$executeRaw`INSERT INTO commerce_audit_events (order_id,event,payload) VALUES (${order.id},'payment_paid',${payload})`;
    // The caller's 50-target limit was already validated and deduplicated.
    // The mandatory internal delivery is additional, not another caller target.
    const memberRecipient=`member:${order.member_id}`;
    const deliveries:NotificationTarget[]=targets.some(target=>target.channel==='in_app' && target.recipient===memberRecipient)
      ? targets : [...targets,{recipient:memberRecipient,channel:'in_app'}];
    for(const target of deliveries) await tx.$executeRaw`INSERT INTO commerce_notifications (order_id,event,channel,recipient,payload) VALUES (${order.id},'payment_paid',${target.channel},${target.recipient},${payload})`;
    return {orderId:order.id,alreadyPaid:false};
  },transactionOptions);
}
