import 'server-only';
import {randomUUID} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import type {CommerceDb,ShippingSnapshot} from '@/lib/commerce/types';
import type {SupplierConfig} from './config';
import type {SupplierOrderRequest} from './types';
import {sumMoney} from '@/lib/commerce/money';
import type {CostLine} from './reservations';

/** Local outbox snapshot only, not an external supplier order. Captured in the
 * checkout transaction so later remapping cannot change paid-order ownership. */
export async function snapshotSupplierOrders(tx:Prisma.TransactionClient,orderId:bigint,shipping:ShippingSnapshot,costLines:Map<string,CostLine[]>) {
 const lines=await tx.$queryRaw<{connection_id:bigint;supplier_id:bigint;external_id:string;quantity:number;unit_cost_minor:number;total_cost_minor:number;total_minor:number;product_id:bigint}[]>`SELECT sp.connection_id,os.supplier_id,sp.external_id,os.quantity,os.unit_cost_minor,os.total_cost_minor,i.total_minor,i.product_id FROM commerce_order_suppliers os JOIN commerce_order_items i ON i.order_id=os.order_id AND i.product_id=os.product_id JOIN supplier_products sp ON sp.commerce_product_id=os.product_id AND sp.supplier_id=os.supplier_id WHERE os.order_id=${orderId} ORDER BY sp.connection_id,i.product_id`;
 const groups=new Map<string,typeof lines>();for(const line of lines){const key=String(line.connection_id);groups.set(key,[...(groups.get(key)||[]),line]);}
 for(const group of groups.values()){
  const first=group[0],key=`supplier:${orderId}:${first.connection_id}`;
  const request:SupplierOrderRequest&{productIds:string[]}={idempotencyKey:key,merchantOrderId:String(orderId),currency:'SAR',shippingMinor:0,shipping,items:group.flatMap(l=>(costLines.get(String(l.product_id))||[{quantity:l.quantity,unitCostMinor:l.unit_cost_minor}]).map(cost=>({externalId:l.external_id,quantity:cost.quantity,unitCostMinor:cost.unitCostMinor}))),productIds:group.map(l=>String(l.product_id))};
  const selling=sumMoney(group.map(l=>l.total_minor)),payable=sumMoney(group.map(l=>l.total_cost_minor));
  await tx.$executeRaw`INSERT INTO supplier_orders(order_id,connection_id,supplier_id,idempotency_key,status,selling_minor,payable_minor,profit_minor,shipping_minor,currency,payment_status,request_snapshot) VALUES(${orderId},${first.connection_id},${first.supplier_id},${key},'awaiting_payment',${selling},${payable},${selling-payable},0,'SAR','unpaid',${JSON.stringify(request)})`;
 }
}
type DispatchRow={id:bigint;order_id:bigint;connection_id:bigint;status:string;active:number;maintenance:number;auto_orders_enabled:number;mode:string;connection_status:string;request_snapshot:SupplierOrderRequest&{productIds:string[]}|string};
/** No caller-supplied paid flag. Receipt must match the immutable Trbhh order.
 * No external request is attempted in development. Live transport stays blocked
 * until the merchant's Salla fulfillment/payment contract is validated. */
export async function dispatchSupplierOrder(db:CommerceDb,id:bigint,config:SupplierConfig):Promise<{status:string}> {
 const claim=randomUUID();
 return db.$transaction(async tx=>{
  const [row]=await tx.$queryRaw<DispatchRow[]>`SELECT so.*,s.active,p.maintenance,p.auto_orders_enabled,p.mode,c.status AS connection_status FROM supplier_orders so JOIN commerce_orders o ON o.id=so.order_id JOIN commerce_receipts r ON r.order_id=o.id AND r.amount_minor=o.total_minor AND r.currency=o.currency JOIN commerce_suppliers s ON s.id=so.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=s.id JOIN supplier_connections c ON c.id=so.connection_id WHERE so.id=${id} AND o.status='paid' AND o.currency='SAR' FOR UPDATE`;
  if(!row||!['awaiting_payment','pending','blocked'].includes(row.status))return {status:'ineligible'};
  if(row.active!==1||row.maintenance!==0||row.auto_orders_enabled!==1||row.connection_status!=='connected')return {status:'disabled'};
  const snapshot=typeof row.request_snapshot==='string'?JSON.parse(row.request_snapshot):row.request_snapshot;
  if(!Array.isArray(snapshot.productIds)||!snapshot.productIds.length)throw new Error('supplier_order_snapshot_invalid');
  for(const productId of snapshot.productIds){
   if(!/^[1-9]\d*$/.test(productId))throw new Error('supplier_order_snapshot_invalid');
   const [product]=await tx.$queryRaw<{active:number}[]>`SELECT active FROM supplier_products WHERE commerce_product_id=${BigInt(productId)} AND connection_id=${row.connection_id} FOR SHARE`;
   if(!product||product.active!==1)return {status:'product_disabled'};
  }
  if(row.mode!=='development'){
   await tx.$executeRaw`UPDATE supplier_orders SET status='blocked',payment_status='paid',last_error=${config.liveOrders?'live_order_contract_required':'live_orders_disabled'},updated_at=CURRENT_TIMESTAMP(3) WHERE id=${id}`;
   return {status:'blocked'};
  }
  // Durable terminal simulation: toggling live mode later never dispatches this order.
  await tx.$executeRaw`UPDATE supplier_orders SET status='simulated',payment_status='paid',claim_token=${claim},attempts=attempts+1,last_error='',updated_at=CURRENT_TIMESTAMP(3) WHERE id=${id}`;
  await tx.$executeRaw`INSERT INTO commerce_audit_events(order_id,event,payload) VALUES(${row.order_id},${`supplier_simulated:${row.connection_id}`},${JSON.stringify({supplierOrderId:String(id),simulation:true})}) ON DUPLICATE KEY UPDATE id=id`;
  return {status:'simulated'};
 });
}
