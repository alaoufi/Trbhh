import 'server-only';
import type {Prisma} from '@prisma/client';
import {checkedMoney,lineTotal,sumMoney} from '@/lib/commerce/money';
type Batch={id:bigint;remaining_quantity:number;held_quantity:number;unit_cost_minor:number};
export type CostLine={reservationId:bigint|null;quantity:number;unitCostMinor:number};
export function allocateCosts(batches:readonly Batch[],quantity:number,normalCost:number):CostLine[] {
 lineTotal(normalCost,quantity);let remaining=quantity;const lines:CostLine[]=[];
 for(const b of batches){checkedMoney(b.remaining_quantity);checkedMoney(b.held_quantity);checkedMoney(b.unit_cost_minor);if(b.held_quantity>b.remaining_quantity)throw new Error('supplier_reservation_corrupt');const take=Math.min(remaining,b.remaining_quantity-b.held_quantity);if(take>0){lines.push({reservationId:b.id,quantity:take,unitCostMinor:b.unit_cost_minor});remaining-=take;}if(!remaining)break;}
 if(remaining)lines.push({reservationId:null,quantity:remaining,unitCostMinor:normalCost});return lines;
}
export async function reserveSupplierCost(tx:Prisma.TransactionClient,orderId:bigint,productId:bigint,supplierId:bigint,quantity:number,normalCost:number,actualSelling:number):Promise<{unitCostMinor:number;totalCostMinor:number;lines:CostLine[]}> {
 const [product]=await tx.$queryRaw<{id:bigint;supplier_id:bigint;active:number;visible:number;available:number;quantity:number|null;unit_cost_minor:number|null;selling_price_minor:number|null;minimum_margin_minor:number;minimum_price_minor:number;variants:unknown;options:unknown}[]>`SELECT id,supplier_id,active,visible,available,quantity,unit_cost_minor,selling_price_minor,minimum_margin_minor,minimum_price_minor,variants,options FROM supplier_products WHERE commerce_product_id=${productId} FOR UPDATE`;
 if(!product)return {unitCostMinor:normalCost,totalCostMinor:lineTotal(normalCost,quantity),lines:[{reservationId:null,quantity,unitCostMinor:normalCost}]};
 if(product.supplier_id!==supplierId||product.active!==1||product.visible!==1||product.available!==1||product.unit_cost_minor===null)throw new Error('supplier_product_unavailable');
 const variants=typeof product.variants==='string'?JSON.parse(product.variants):product.variants,options=typeof product.options==='string'?JSON.parse(product.options):product.options;
 if(!Array.isArray(variants)||!Array.isArray(options)||variants.length||options.length)throw new Error('supplier_variant_checkout_required');
 const [stock]=await tx.$queryRaw<{stock_reserved:number}[]>`SELECT stock_reserved FROM commerce_products WHERE id=${productId}`;
 const [pending]=await tx.$queryRaw<{quantity:bigint}[]>`SELECT COALESCE(SUM(i.quantity),0) AS quantity FROM commerce_order_items i JOIN commerce_orders o ON o.id=i.order_id WHERE i.product_id=${productId} AND o.status='paid' AND o.fulfillment_status<>'fulfilled'`;
 if(product.quantity===null||product.quantity<stock.stock_reserved+Number(pending.quantity))throw new Error('supplier_stock_unavailable');
 const [gate]=await tx.$queryRaw<{maintenance:number;status:string}[]>`SELECT p.maintenance,c.status FROM supplier_integration_profiles p JOIN supplier_connections c ON c.supplier_id=p.supplier_id JOIN supplier_products sp ON sp.connection_id=c.id WHERE sp.id=${product.id} FOR SHARE`;
 if(!gate||gate.maintenance!==0||gate.status!=='connected')throw new Error('supplier_product_unavailable');
 const tiers=await tx.$queryRaw<{unit_cost_minor:number}[]>`SELECT unit_cost_minor FROM supplier_price_tiers WHERE supplier_product_id=${product.id} AND active=1 AND min_quantity<=${quantity} ORDER BY min_quantity DESC LIMIT 1 FOR SHARE`;
 const batches=await tx.$queryRaw<Batch[]>`SELECT id,remaining_quantity,held_quantity,unit_cost_minor FROM supplier_stock_reservations WHERE supplier_product_id=${product.id} AND active=1 ORDER BY priority,id FOR UPDATE`;
 const lines=allocateCosts(batches,quantity,tiers[0]?.unit_cost_minor??product.unit_cost_minor);
 const totalCostMinor=sumMoney(lines.map(l=>lineTotal(l.unitCostMinor,l.quantity)));
 if(actualSelling<product.minimum_price_minor||lineTotal(actualSelling,quantity)-totalCostMinor<lineTotal(product.minimum_margin_minor,quantity))throw new Error('supplier_price_below_minimum');
 for(const line of lines)if(line.reservationId!==null){
  await tx.$executeRaw`UPDATE supplier_stock_reservations SET held_quantity=held_quantity+${line.quantity} WHERE id=${line.reservationId}`;
  await tx.$executeRaw`INSERT INTO supplier_reservation_allocations(reservation_id,order_id,commerce_product_id,quantity,status) VALUES(${line.reservationId},${orderId},${productId},${line.quantity},'held')`;
 }
 // Existing legacy unit field is rounded up for display; accounting always uses
 // exact total_cost_minor. Supplier outbox preserves the exact split cost lines.
 return {unitCostMinor:Math.ceil(totalCostMinor/quantity),totalCostMinor,lines};
}
export async function finishSupplierReservations(tx:Prisma.TransactionClient,orderId:bigint,consume:boolean) {
 const allocations=await tx.$queryRaw<{id:bigint;reservation_id:bigint;quantity:number}[]>`SELECT id,reservation_id,quantity FROM supplier_reservation_allocations WHERE order_id=${orderId} AND status='held' ORDER BY reservation_id FOR UPDATE`;
 for(const a of allocations){
  const changed=consume?await tx.$executeRaw`UPDATE supplier_stock_reservations SET held_quantity=held_quantity-${a.quantity},remaining_quantity=remaining_quantity-${a.quantity} WHERE id=${a.reservation_id} AND held_quantity>=${a.quantity} AND remaining_quantity>=${a.quantity}`:await tx.$executeRaw`UPDATE supplier_stock_reservations SET held_quantity=held_quantity-${a.quantity} WHERE id=${a.reservation_id} AND held_quantity>=${a.quantity}`;
  if(changed!==1)throw new Error('supplier_reservation_mismatch');
  await tx.$executeRaw`UPDATE supplier_reservation_allocations SET status=${consume?'consumed':'released'} WHERE id=${a.id}`;
 }
}
export async function capReleasedSupplierStock(tx:Prisma.TransactionClient,productId:bigint) {
 const [source]=await tx.$queryRaw<{quantity:number|null;available:number;variants:unknown;options:unknown}[]>`SELECT quantity,available,variants,options FROM supplier_products WHERE commerce_product_id=${productId} FOR UPDATE`;
 if(!source)return;
 const options=typeof source.options==='string'?JSON.parse(source.options):source.options,variants=typeof source.variants==='string'?JSON.parse(source.variants):source.variants;
 const [pending]=await tx.$queryRaw<{quantity:bigint}[]>`SELECT COALESCE(SUM(i.quantity),0) AS quantity FROM commerce_order_items i JOIN commerce_orders o ON o.id=i.order_id WHERE i.product_id=${productId} AND o.status='paid' AND o.fulfillment_status<>'fulfilled'`;
 const cap=source.available===1&&Array.isArray(options)&&!options.length&&Array.isArray(variants)&&!variants.length?Math.max(0,(source.quantity??0)-Number(pending.quantity)):0;
 await tx.$executeRaw`UPDATE commerce_products SET stock_available=LEAST(stock_available,GREATEST(0,${cap}-stock_reserved)) WHERE id=${productId}`;
}
