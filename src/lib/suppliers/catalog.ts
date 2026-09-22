import 'server-only';
import type {CommerceDb} from '@/lib/commerce/types';
import {checkedMoney} from '@/lib/commerce/money';
import type {SupplierProduct} from './types';
import {assertSupplierSchemaReady} from './schema';

type Existing={id:bigint;supplier_id:bigint;commerce_product_id:bigint|null;public_price_minor:number;unit_cost_minor:number|null;selling_price_minor:number|null;source_updated_at:Date|null};
export type SyncGate={supplier_id:bigint;provider:string;status:string;active:number;maintenance:number;sync_enabled:number;mode:string;sync_claim:string|null};
export function assertSyncGate(gate:SyncGate|undefined,claim:string|null):asserts gate is SyncGate {
  if(!gate||gate.provider!=='salla'||gate.status!=='connected'||gate.active!==1||gate.maintenance!==0||gate.sync_enabled!==1)throw new Error('supplier_sync_unavailable');
  if(gate.sync_claim!==claim)throw new Error('supplier_sync_claim_lost');
}
function validate(product:SupplierProduct){
  checkedMoney(product.publicPriceMinor);
  if(product.currency!=='SAR'||typeof product.externalId!=='string'||!product.externalId||product.externalId.length>191||!product.name.trim()||product.name.length>255||product.sku.length>191||product.brand.length>255||Buffer.byteLength(product.description)>65535||typeof product.available!=='boolean')throw new Error('supplier_invalid_product');
  if(product.quantity!==null&&(!Number.isSafeInteger(product.quantity)||product.quantity<0||product.quantity>2147483647))throw new Error('supplier_invalid_quantity');
  if(product.sourceUpdatedAt!==null&&!Number.isFinite(new Date(product.sourceUpdatedAt).getTime()))throw new Error('supplier_invalid_timestamp');
  for(const field of [product.images,product.variants,product.options,product.categories])if(!Array.isArray(field)||Buffer.byteLength(JSON.stringify(field))>1024*1024)throw new Error('supplier_invalid_product');
}

export async function upsertSourceProduct(db:CommerceDb,connectionId:bigint,product:SupplierProduct):Promise<void>{
  await assertSupplierSchemaReady(db);
  await upsertClaimedSourceProduct(db,connectionId,product,null);
}

/** Internal sync primitive. A persisted owner token fences late responses after takeover. */
export async function upsertClaimedSourceProduct(db:CommerceDb,connectionId:bigint,product:SupplierProduct,claim:string|null):Promise<void>{
  validate(product);
  await db.$transaction(async tx=>{
    // Match pricing/admin and checkout: commerce product before imported product.
    const [lookup]=await tx.$queryRaw<Existing[]>`SELECT id,commerce_product_id FROM supplier_products WHERE connection_id=${connectionId} AND external_id=${product.externalId}`;
    let stock:{stock_available:number;stock_reserved:number}|undefined;
    if(lookup?.commerce_product_id){
      [stock]=await tx.$queryRaw<{stock_available:number;stock_reserved:number}[]>`SELECT stock_available,stock_reserved FROM commerce_products WHERE id=${lookup.commerce_product_id} FOR UPDATE`;
      if(!stock)throw new Error('supplier_mapping_invalid');
    }
    const [existing]=await tx.$queryRaw<Existing[]>`SELECT id,supplier_id,commerce_product_id,public_price_minor,unit_cost_minor,selling_price_minor,source_updated_at FROM supplier_products WHERE connection_id=${connectionId} AND external_id=${product.externalId} FOR UPDATE`;
    if(existing?.commerce_product_id!==(lookup?.commerce_product_id??null)&&existing?.commerce_product_id!=null)throw new Error('supplier_mapping_changed');
    const [gate]=await tx.$queryRaw<SyncGate[]>`SELECT c.supplier_id,c.provider,c.status,c.sync_claim,s.active,p.maintenance,p.sync_enabled,p.mode FROM supplier_connections c JOIN commerce_suppliers s ON s.id=c.supplier_id JOIN supplier_integration_profiles p ON p.supplier_id=c.supplier_id AND p.provider=c.provider WHERE c.id=${connectionId} FOR SHARE`;
    assertSyncGate(gate,claim);
    if(existing&&existing.supplier_id!==gate.supplier_id)throw new Error('supplier_mapping_invalid');
    const sourceDate=product.sourceUpdatedAt===null?null:new Date(product.sourceUpdatedAt);
    if(existing?.source_updated_at&&sourceDate&&sourceDate<existing.source_updated_at)return;
    const restrictionsOnly=!!existing?.source_updated_at&&!sourceDate;
    const complex=product.variants.length>0||product.options.length>0;
    const images=JSON.stringify(product.images),variants=JSON.stringify(product.variants),options=JSON.stringify(product.options),categories=JSON.stringify(product.categories);
    let productId=existing?.id;
    if(existing&&restrictionsOnly){
      // Missing timezone/date is uncertainty, not proof of staleness. Honor only
      // restrictions; retain dated metadata/price and never clear known variants.
      await tx.$executeRaw`UPDATE supplier_products SET available=LEAST(available,${Number(product.available&&!complex&&product.quantity!==null)}),quantity=LEAST(COALESCE(quantity,${product.quantity??0}),${product.quantity??0}),variants=CASE WHEN ${product.variants.length}>0 THEN ${variants} ELSE variants END,options=CASE WHEN ${product.options.length}>0 THEN ${options} ELSE options END,last_sync_at=CURRENT_TIMESTAMP(3),sync_error='',revision=revision+1 WHERE id=${existing.id}`;
    }else if(existing){
      await tx.$executeRaw`UPDATE supplier_products SET sku=${product.sku},name=${product.name},description=${product.description},images=${images},variants=${variants},options=${options},categories=${categories},brand=${product.brand},public_price_minor=${product.publicPriceMinor},currency='SAR',quantity=${product.quantity},available=${Number(product.available)},source_updated_at=${sourceDate},last_sync_at=CURRENT_TIMESTAMP(3),sync_error='',revision=revision+1 WHERE id=${existing.id}`;
    }else{
      // Administrative values deliberately omitted: schema defaults are hidden/inactive/unmapped.
      await tx.$executeRaw`INSERT INTO supplier_products(connection_id,supplier_id,external_id,sku,name,description,images,variants,options,categories,brand,public_price_minor,currency,quantity,available,source_updated_at,last_sync_at) VALUES(${connectionId},${gate.supplier_id},${product.externalId},${product.sku},${product.name},${product.description},${images},${variants},${options},${categories},${product.brand},${product.publicPriceMinor},'SAR',${product.quantity},${Number(product.available)},${sourceDate},CURRENT_TIMESTAMP(3))`;
      const [inserted]=await tx.$queryRaw<{id:bigint}[]>`SELECT LAST_INSERT_ID() AS id`;productId=inserted.id;
    }
    if(!restrictionsOnly&&(!existing||existing.public_price_minor!==product.publicPriceMinor)){
      await tx.$executeRaw`INSERT INTO supplier_price_history(supplier_product_id,kind,old_public_minor,new_public_minor,old_cost_minor,new_cost_minor,old_selling_minor,new_selling_minor) VALUES(${productId!},'source',${existing?.public_price_minor??null},${product.publicPriceMinor},${existing?.unit_cost_minor??null},${existing?.unit_cost_minor??null},${existing?.selling_price_minor??null},${existing?.selling_price_minor??null})`;
    }
    if(existing?.commerce_product_id&&stock){
      // Count all paid obligations until an explicit fulfilled terminal state exists.
      const [pending]=await tx.$queryRaw<{quantity:bigint|number|string|null}[]>`SELECT COALESCE(SUM(i.quantity),0) AS quantity FROM commerce_order_items i JOIN commerce_orders o ON o.id=i.order_id WHERE i.product_id=${existing.commerce_product_id} AND o.status='paid' AND o.fulfillment_status<>'fulfilled'`;
      const paid=Number(pending.quantity);
      if(!Number.isSafeInteger(paid)||paid<0)throw new Error('supplier_stock_invalid');
      const cap=!complex&&product.available&&product.quantity!==null?Math.max(0,product.quantity-stock.stock_reserved-paid):0;
      await tx.$executeRaw`UPDATE commerce_products SET stock_available=${Math.min(stock.stock_available,cap)},updated_at=CURRENT_TIMESTAMP(3) WHERE id=${existing.commerce_product_id}`;
    }
  },{isolationLevel:'ReadCommitted'});
}
