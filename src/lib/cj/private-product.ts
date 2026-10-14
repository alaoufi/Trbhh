import 'server-only';
import {prisma} from '@/lib/prisma';
import type {CommerceDb} from '@/lib/commerce/types';
import {checkedMoney} from '@/lib/commerce/money';
import {requireCjLiveTrialAuthority} from './private-trial';
/** Called only AFTER live VID/quantity/freight/tax verification. Private mapping
 * is infrastructure for staff checkout, never publication approval. */
export async function ensurePrivateCjCommerceProduct(db:CommerceDb=prisma,input:{memberId:bigint;cjRowId:number;pid:string;unitSarMinor:number;verifiedQuantity:number}):Promise<bigint>{
 await requireCjLiveTrialAuthority(input.memberId);
 checkedMoney(input.unitSarMinor);if(input.unitSarMinor<=0||!Number.isSafeInteger(input.verifiedQuantity)||input.verifiedQuantity<1||input.verifiedQuantity>99)throw new Error('cj_private_product_invalid');
 return db.$transaction(async tx=>{
  const [row]=await tx.$queryRaw<{id:bigint;cj_product_id:string;commerce_product_id:bigint|null;name_ar:string;name:string;hidden:number}[]>`SELECT id,cj_product_id,commerce_product_id,name_ar,name,hidden FROM cj_products WHERE id=${BigInt(input.cjRowId)} FOR UPDATE`;
  if(!row||row.cj_product_id!==input.pid||row.hidden!==0)throw new Error('cj_private_product_changed');
  if(row.commerce_product_id)return row.commerce_product_id;
  const title=(row.name_ar||row.name||'منتج خاص').slice(0,200);
  await tx.$executeRaw`INSERT INTO commerce_products(title,price_minor,currency,stock_available,stock_reserved,approved,visible,enabled) VALUES(${title},${input.unitSarMinor},'SAR',${input.verifiedQuantity},0,0,0,0)`;
  const [created]=await tx.$queryRaw<{id:bigint}[]>`SELECT LAST_INSERT_ID() AS id`;
  if(!created?.id)throw new Error('cj_private_product_missing');
  await tx.$executeRaw`UPDATE cj_products SET commerce_product_id=${created.id} WHERE id=${row.id}`;
  return created.id;
 },{maxWait:10000,timeout:20000});
}
