import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import type {CommerceDb,ShippingSnapshot} from '@/lib/commerce/types';
import type {SupplierConfig} from './config';
import type {SupplierOrderRequest} from './types';
import {sumMoney} from '@/lib/commerce/money';
import type {CostLine} from './reservations';
import {adapterForConnection} from './registry';

/** Local outbox snapshot only, not an external supplier order. Captured in the
 * checkout transaction so later remapping cannot change paid-order ownership. */
export async function snapshotSupplierOrders(tx:Prisma.TransactionClient,orderId:bigint,shipping:ShippingSnapshot,costLines:Map<string,CostLine[]>) {
 const lines=await tx.$queryRaw<{connection_id:bigint;supplier_id:bigint;external_id:string;name:string;sku:string;variants:unknown;quantity:number;unit_cost_minor:number;total_cost_minor:number;total_minor:number;product_id:bigint}[]>`SELECT sp.connection_id,os.supplier_id,sp.external_id,sp.name,sp.sku,sp.variants,os.quantity,os.unit_cost_minor,os.total_cost_minor,i.total_minor,i.product_id FROM commerce_order_suppliers os JOIN commerce_order_items i ON i.order_id=os.order_id AND i.product_id=os.product_id JOIN supplier_products sp ON sp.commerce_product_id=os.product_id AND sp.supplier_id=os.supplier_id WHERE os.order_id=${orderId} ORDER BY sp.connection_id,i.product_id`;
 const groups=new Map<string,typeof lines>();for(const line of lines){const key=String(line.connection_id);groups.set(key,[...(groups.get(key)||[]),line]);}
 for(const group of groups.values()){
  const first=group[0],key=`supplier:${orderId}:${first.connection_id}`;
  const request:SupplierOrderRequest&{productIds:string[]}={idempotencyKey:key,merchantOrderId:String(orderId),currency:'SAR',shippingMinor:0,shipping,items:group.flatMap(l=>{
   const variants=typeof l.variants==='string'?JSON.parse(l.variants):l.variants;
   if(!Array.isArray(variants))throw new Error('supplier_order_snapshot_invalid');
   return (costLines.get(String(l.product_id))||[{quantity:l.quantity,unitCostMinor:l.unit_cost_minor}]).map(cost=>({externalId:l.external_id,hasVariants:variants.length>0,name:l.name,sku:l.sku,quantity:cost.quantity,unitCostMinor:cost.unitCostMinor}));
  }),productIds:group.map(l=>String(l.product_id))};
  const selling=sumMoney(group.map(l=>l.total_minor)),payable=sumMoney(group.map(l=>l.total_cost_minor));
  await tx.$executeRaw`INSERT INTO supplier_orders(order_id,connection_id,supplier_id,idempotency_key,status,selling_minor,payable_minor,profit_minor,shipping_minor,currency,payment_status,request_snapshot) VALUES(${orderId},${first.connection_id},${first.supplier_id},${key},'awaiting_payment',${selling},${payable},${selling-payable},0,'SAR','unpaid',${JSON.stringify(request)})`;
 }
}
type DispatchRow={id:bigint;order_id:bigint;connection_id:bigint;supplier_id:bigint;status:string;attempts:number;external_order_id:string|null;store_coordinator_phone:string;active:number;maintenance:number;auto_orders_enabled:number;mode:string;connection_status:string;request_snapshot:SupplierOrderRequest&{productIds:string[]}|string};
type AdapterFactory=typeof adapterForConnection;
/** No caller-supplied paid flag. Receipt must match the immutable Trbhh order.
 * No external request is attempted in development or while the explicit live
 * gate is disabled. */
export async function dispatchSupplierOrder(db:CommerceDb,id:bigint,config:SupplierConfig,adapterFactory:AdapterFactory=adapterForConnection):Promise<{status:string}> {
 const claim=randomUUID();
 const claimed=await db.$transaction(async tx=>{
  const [row]=await tx.$queryRaw<DispatchRow[]>`SELECT so.*,s.store_coordinator_phone,s.active,p.maintenance,p.auto_orders_enabled,p.mode,c.status AS connection_status FROM supplier_orders so JOIN commerce_orders o ON o.id=so.order_id JOIN commerce_receipts r ON r.order_id=o.id AND r.amount_minor=o.total_minor AND r.currency=o.currency JOIN commerce_suppliers s ON s.id=so.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=s.id JOIN supplier_connections c ON c.id=so.connection_id WHERE so.id=${id} AND o.status='paid' AND o.currency='SAR' FOR UPDATE`;
  if(!row||!['awaiting_payment','pending','blocked'].includes(row.status))return {status:'ineligible'};
  if(row.external_order_id)return {status:'ineligible'};
  if(row.active!==1||row.maintenance!==0||row.auto_orders_enabled!==1||row.connection_status!=='connected')return {status:'disabled'};
  const snapshot=typeof row.request_snapshot==='string'?JSON.parse(row.request_snapshot):row.request_snapshot;
  if(!snapshot||!Array.isArray(snapshot.productIds)||!snapshot.productIds.length||!Array.isArray(snapshot.items)||!snapshot.items.length)throw new Error('supplier_order_snapshot_invalid');
  for(const productId of snapshot.productIds){
   if(!/^[1-9]\d*$/.test(productId))throw new Error('supplier_order_snapshot_invalid');
   const [product]=await tx.$queryRaw<{active:number}[]>`SELECT active FROM supplier_products WHERE commerce_product_id=${BigInt(productId)} AND connection_id=${row.connection_id} FOR SHARE`;
   if(!product||product.active!==1)return {status:'product_disabled'};
  }
  if(row.mode!=='development'){
   if(!config.liveOrders){
    await tx.$executeRaw`UPDATE supplier_orders SET status='blocked',payment_status='paid',last_error='live_orders_disabled',updated_at=CURRENT_TIMESTAMP(3) WHERE id=${id}`;
    return {status:'blocked'};
   }
   const attemptNo=row.attempts+1,fingerprint=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
   await tx.$executeRaw`INSERT INTO supplier_order_sync_attempts(supplier_order_id,attempt_no,operation,status,request_fingerprint) VALUES(${id},${attemptNo},'create_order','started',${fingerprint})`;
   await tx.$executeRaw`UPDATE supplier_orders SET status='sending',payment_status='paid',claim_token=${claim},attempts=${attemptNo},last_error='',updated_at=CURRENT_TIMESTAMP(3) WHERE id=${id}`;
   return {status:'claimed',row,snapshot,attemptNo};
  }
  // Durable terminal simulation: toggling live mode later never dispatches this order.
  await tx.$executeRaw`UPDATE supplier_orders SET status='simulated',payment_status='paid',claim_token=${claim},attempts=attempts+1,last_error='',updated_at=CURRENT_TIMESTAMP(3) WHERE id=${id}`;
  await tx.$executeRaw`INSERT INTO commerce_audit_events(order_id,event,payload) VALUES(${row.order_id},${`supplier_simulated:${row.connection_id}`},${JSON.stringify({supplierOrderId:String(id),simulation:true})}) ON DUPLICATE KEY UPDATE id=id`;
  return {status:'simulated'};
 });
 if(claimed.status!=='claimed'||!('row' in claimed)||!claimed.row||!('snapshot' in claimed)||!('attemptNo' in claimed))return {status:claimed.status};
 const dispatchRow=claimed.row,dispatchSnapshot=claimed.snapshot,attemptNo=claimed.attemptNo;
 try{
  const adapter=await adapterFactory(db,dispatchRow.connection_id,config);
  const result=await adapter.createOrder(dispatchSnapshot);
  if(result.status!=='submitted')throw new Error(result.status==='unknown'?result.errorCode:'supplier_order_not_submitted');
  return db.$transaction(async tx=>{
   const [owned]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM supplier_orders WHERE id=${id} AND status='sending' AND claim_token=${claim} FOR UPDATE`;
   if(!owned)return {status:'lost'};
   await tx.$executeRaw`UPDATE supplier_orders SET status='submitted',external_order_id=${result.externalOrderId},external_order_url=${result.externalOrderUrl},external_customer_id=${result.externalCustomerId},claim_token=NULL,last_error='',updated_at=CURRENT_TIMESTAMP(3) WHERE id=${id} AND claim_token=${claim}`;
   await tx.$executeRaw`UPDATE supplier_order_sync_attempts SET status='submitted',external_order_id=${result.externalOrderId},finished_at=CURRENT_TIMESTAMP(3),error_code='' WHERE supplier_order_id=${id} AND attempt_no=${attemptNo}`;
   if(dispatchRow.store_coordinator_phone)await tx.$executeRaw`INSERT INTO supplier_coordinator_notifications(supplier_order_id,supplier_id,event,channel,recipient,status) VALUES(${id},${dispatchRow.supplier_id},'order_submitted','sms',${dispatchRow.store_coordinator_phone},'pending') ON DUPLICATE KEY UPDATE id=id`;
   await tx.$executeRaw`INSERT INTO commerce_audit_events(order_id,event,payload) VALUES(${dispatchRow.order_id},${`supplier_submitted:${dispatchRow.connection_id}`},${JSON.stringify({supplierOrderId:String(id),sallaOrderId:result.externalOrderId})}) ON DUPLICATE KEY UPDATE id=id`;
   return {status:'submitted'};
  });
 }catch(error){
  const code=(error instanceof Error?error.message:'supplier_order_unknown').slice(0,80);
  await db.$transaction(async tx=>{
   await tx.$executeRaw`UPDATE supplier_orders SET status='unknown',claim_token=NULL,last_error=${code},updated_at=CURRENT_TIMESTAMP(3) WHERE id=${id} AND status='sending' AND claim_token=${claim}`;
   await tx.$executeRaw`UPDATE supplier_order_sync_attempts SET status='unknown',error_code=${code},finished_at=CURRENT_TIMESTAMP(3) WHERE supplier_order_id=${id} AND attempt_no=${attemptNo} AND status='started'`;
  });
  return {status:'unknown'};
 }
}
