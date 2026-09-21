import 'server-only';
import type {Prisma} from '@prisma/client';
import type {CommerceDb} from '@/lib/commerce/types';
import {parseSar} from '@/lib/commerce/money';
import {calculatePricing} from './pricing';
import type {SupplierPricingPolicy,SupplierProvider,SupplierMode} from './types';
export function formId(form:FormData,key='id'):bigint {const raw=String(form.get(key)||'');if(!/^[1-9]\d{0,14}$/.test(raw))throw new Error('supplier_invalid_fields');return BigInt(raw);}
const flag=(form:FormData,key:string)=>form.get(key)==='1';
export function parseIntegrationControls(form:FormData) {
  const provider=String(form.get('provider')),mode=String(form.get('mode'));
  if(!['salla','cj','other'].includes(provider)||!['development','live'].includes(mode))throw new Error('supplier_invalid_fields');
  const syncEnabled=flag(form,'syncEnabled'),autoOrdersEnabled=flag(form,'autoOrdersEnabled');
  if(mode!=='live'&&(syncEnabled||autoOrdersEnabled))throw new Error('supplier_invalid_fields');
  return {supplierId:formId(form,'supplierId'),provider:provider as SupplierProvider,mode:mode as SupplierMode,active:flag(form,'active'),maintenance:flag(form,'maintenance'),syncEnabled,autoOrdersEnabled};
}
export function parseProductControls(form:FormData) {
  const policy=String(form.get('policy')),revision=Number(form.get('revision'));
  if(!['manual','source','fixed_discount','percent_discount'].includes(policy)||!Number.isSafeInteger(revision)||revision<0)throw new Error('supplier_invalid_fields');
  const discountBps=Number(form.get('discountBps')||0);if(!Number.isInteger(discountBps)||discountBps<0||discountBps>10000)throw new Error('supplier_invalid_fields');
  return {id:formId(form),revision,policy:policy as SupplierPricingPolicy,costMinor:parseSar(String(form.get('cost')||'')),sellingMinor:parseSar(String(form.get('selling')||'0')),discountMinor:parseSar(String(form.get('discount')||'0')),discountBps,minimumPriceMinor:parseSar(String(form.get('minimumPrice')||'0')),minimumMarginMinor:parseSar(String(form.get('minimumMargin')||'0')),active:flag(form,'active'),visible:flag(form,'visible'),featured:flag(form,'featured')};
}
export async function saveIntegration(db:CommerceDb,input:ReturnType<typeof parseIntegrationControls>,adminId:bigint) {
  await db.$transaction(async tx=>{
    const [supplier]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_suppliers WHERE id=${input.supplierId} FOR UPDATE`;
    if(!supplier)throw new Error('supplier_not_found');
    const [profile]=await tx.$queryRaw<{provider:string}[]>`SELECT provider FROM supplier_integration_profiles WHERE supplier_id=${input.supplierId} FOR UPDATE`;
    if(profile&&profile.provider!==input.provider)throw new Error('supplier_provider_immutable');
    await tx.$executeRaw`INSERT INTO supplier_integration_profiles(supplier_id,provider,maintenance,sync_enabled,auto_orders_enabled,mode) VALUES(${input.supplierId},${input.provider},${Number(input.maintenance)},${Number(input.syncEnabled)},${Number(input.autoOrdersEnabled)},${input.mode}) ON DUPLICATE KEY UPDATE maintenance=VALUES(maintenance),sync_enabled=VALUES(sync_enabled),auto_orders_enabled=VALUES(auto_orders_enabled),mode=VALUES(mode)`;
    await tx.$executeRaw`UPDATE commerce_suppliers SET active=${Number(input.active)},updated_at=CURRENT_TIMESTAMP(3) WHERE id=${input.supplierId}`;
    if(!input.active||input.maintenance)await tx.$executeRaw`UPDATE commerce_products cp JOIN supplier_products sp ON sp.commerce_product_id=cp.id SET cp.enabled=0 WHERE sp.supplier_id=${input.supplierId}`;
    await tx.admin_log.create({data:{admin_id:adminId,action:'ضبط تكامل مورد',target:input.supplierId.toString(),note:`provider=${input.provider};mode=${input.mode};active=${Number(input.active)};maintenance=${Number(input.maintenance)}`}});
  });
}
type Product={id:bigint;connection_id:bigint;supplier_id:bigint;commerce_product_id:bigint|null;revision:number;name:string;sku:string;public_price_minor:number;unit_cost_minor:number|null;selling_price_minor:number|null;quantity:number|null;available:number;variants:unknown;options:unknown};
const hasVariants=(v:unknown)=>{try {return Array.isArray(typeof v==='string'?JSON.parse(v):v)&&(typeof v==='string'?JSON.parse(v):v).length>0;}catch{return true;}};
export async function saveProductControls(db:CommerceDb,input:ReturnType<typeof parseProductControls>,adminId:bigint) {
  await db.$transaction(tx=>saveProductControlsInTransaction(tx,input,adminId));
}
/** Reuse the existing pricing/mapping operation inside an all-or-nothing review. */
export async function saveProductControlsInTransaction(tx:Prisma.TransactionClient,input:ReturnType<typeof parseProductControls>,adminId:bigint) {
    // Lock commerce product before imported row, matching checkout/sync lock order.
    const [lookup]=await tx.$queryRaw<{commerce_product_id:bigint|null}[]>`SELECT commerce_product_id FROM supplier_products WHERE id=${input.id}`;
    if(lookup?.commerce_product_id)await tx.$queryRaw`SELECT id FROM commerce_products WHERE id=${lookup.commerce_product_id} FOR UPDATE`;
    const [product]=await tx.$queryRaw<Product[]>`SELECT * FROM supplier_products WHERE id=${input.id} FOR UPDATE`;
    if(!product||product.revision!==input.revision)throw new Error('supplier_product_conflict');
    const price=calculatePricing({publicMinor:product.public_price_minor,costMinor:input.costMinor,policy:input.policy,sellingMinor:input.sellingMinor,discountMinor:input.discountMinor,discountBps:input.discountBps,minimumPriceMinor:input.minimumPriceMinor,minimumMarginMinor:input.minimumMarginMinor});
    const [policy]=await tx.$queryRaw<{active:number;maintenance:number;status:string}[]>`SELECT s.active,p.maintenance,c.status FROM commerce_suppliers s JOIN supplier_integration_profiles p ON p.supplier_id=s.id JOIN supplier_connections c ON c.supplier_id=s.id WHERE s.id=${product.supplier_id} AND c.id=${product.connection_id} FOR SHARE`;
    if(input.active&&(!policy||policy.active!==1||policy.maintenance!==0||policy.status!=='connected'))throw new Error('supplier_connection_unavailable');
    // Variant selection is not part of the existing checkout. Fail closed instead of ordering the wrong SKU.
    if(input.active&&(hasVariants(product.variants)||hasVariants(product.options)))throw new Error('supplier_variant_checkout_required');
    let commerceId=product.commerce_product_id;
    if(!commerceId){
      await tx.$executeRaw`INSERT INTO commerce_products(title,price_minor,currency,stock_available,approved,visible,enabled) VALUES(${product.name.slice(0,200)},${price.sellingMinor},'SAR',${product.available?product.quantity||0:0},1,${Number(input.visible)},${Number(input.active)})`;
      const [inserted]=await tx.$queryRaw<{id:bigint}[]>`SELECT LAST_INSERT_ID() AS id`;commerceId=inserted.id;
    } else {
      // Existing stock is intentionally not replenished by pricing/visibility edits.
      await tx.$executeRaw`UPDATE commerce_products SET title=${product.name.slice(0,200)},price_minor=${price.sellingMinor},visible=${Number(input.visible)},enabled=${Number(input.active)},updated_at=CURRENT_TIMESTAMP(3) WHERE id=${commerceId}`;
    }
    await tx.$executeRaw`INSERT INTO commerce_product_suppliers(product_id,supplier_id,supplier_sku,unit_cost_minor,currency) VALUES(${commerceId},${product.supplier_id},${product.sku.slice(0,128)},${price.costMinor},'SAR') ON DUPLICATE KEY UPDATE unit_cost_minor=VALUES(unit_cost_minor),supplier_sku=VALUES(supplier_sku)`;
    await tx.$executeRaw`INSERT INTO supplier_price_history(supplier_product_id,actor_id,kind,old_public_minor,new_public_minor,old_cost_minor,new_cost_minor,old_selling_minor,new_selling_minor) VALUES(${product.id},${adminId},'admin',${product.public_price_minor},${product.public_price_minor},${product.unit_cost_minor},${price.costMinor},${product.selling_price_minor},${price.sellingMinor})`;
    await tx.$executeRaw`UPDATE supplier_products SET commerce_product_id=${commerceId},unit_cost_minor=${price.costMinor},selling_price_minor=${price.sellingMinor},pricing_policy=${input.policy},discount_minor=${input.discountMinor},discount_bps=${input.discountBps},minimum_price_minor=${input.minimumPriceMinor},minimum_margin_minor=${input.minimumMarginMinor},active=${Number(input.active)},visible=${Number(input.visible)},featured=${Number(input.featured)},revision=revision+1 WHERE id=${product.id}`;
    await tx.admin_log.create({data:{admin_id:adminId,action:'ضبط منتج مورد',target:product.id.toString(),note:`visible=${Number(input.visible)};active=${Number(input.active)};selling=${price.sellingMinor};cost=${price.costMinor}`}});
}
export async function addPriceTier(db:CommerceDb,form:FormData,adminId:bigint) {
  const productId=formId(form,'productId'),quantity=Number(form.get('quantity')),cost=parseSar(String(form.get('cost')||'')),kind=String(form.get('kind'));
  const submissionKey=String(form.get('submissionKey')||'');if(!/^[a-f0-9-]{36}$/.test(submissionKey))throw new Error('supplier_invalid_fields');
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000||!['tier','prepaid','commitment'].includes(kind))throw new Error('supplier_invalid_fields');
  await db.$transaction(async tx=>{
    const [product]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM supplier_products WHERE id=${productId} FOR UPDATE`;if(!product)throw new Error('supplier_product_missing');
    if(kind==='tier')await tx.$executeRaw`INSERT INTO supplier_price_tiers(supplier_product_id,min_quantity,unit_cost_minor,active) VALUES(${productId},${quantity},${cost},1) ON DUPLICATE KEY UPDATE id=id`;
    else {
      const [existing]=await tx.$queryRaw<{supplier_product_id:bigint;kind:string;quantity:number;unit_cost_minor:number}[]>`SELECT supplier_product_id,kind,quantity,unit_cost_minor FROM supplier_stock_reservations WHERE submission_key=${submissionKey} FOR UPDATE`;
      if(existing){if(existing.supplier_product_id!==productId||existing.kind!==kind||existing.quantity!==quantity||existing.unit_cost_minor!==cost)throw new Error('supplier_submission_conflict');return;}
      await tx.$executeRaw`INSERT INTO supplier_stock_reservations(submission_key,supplier_product_id,kind,quantity,remaining_quantity,held_quantity,unit_cost_minor,active,priority) VALUES(${submissionKey},${productId},${kind},${quantity},${quantity},0,${cost},1,0)`;
    }
    await tx.admin_log.create({data:{admin_id:adminId,action:'تسجيل اتفاق كمية مورد',target:productId.toString(),note:`kind=${kind};quantity=${quantity};cost=${cost};no_external_payment`}});
  });
}
/** Emergency disable/hide never depends on price validation or source availability. */
export async function stopProduct(db:CommerceDb,id:bigint,hide:boolean,adminId:bigint) {
 await db.$transaction(async tx=>{
  const [row]=await tx.$queryRaw<{commerce_product_id:bigint|null}[]>`SELECT commerce_product_id FROM supplier_products WHERE id=${id}`;
  if(!row)throw new Error('supplier_product_missing');
  if(row.commerce_product_id)await tx.$executeRaw`UPDATE commerce_products SET enabled=0,visible=IF(${hide},0,visible),updated_at=CURRENT_TIMESTAMP(3) WHERE id=${row.commerce_product_id}`;
  await tx.$executeRaw`UPDATE supplier_products SET active=0,visible=IF(${hide},0,visible),revision=revision+1 WHERE id=${id}`;
  await tx.admin_log.create({data:{admin_id:adminId,action:'إيقاف منتج مورد',target:String(id),note:`hide=${Number(hide)}`}});
 });
}
