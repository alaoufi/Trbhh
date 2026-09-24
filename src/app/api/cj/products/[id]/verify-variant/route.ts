import {NextResponse} from 'next/server';
import {getSession} from '@/lib/auth';
import {hasAccess} from '@/lib/access-control/guards';
import {getStorefrontCjProduct,parseCjDetails} from '@/lib/cj/mapping';
import {verifyCjVariantForSaudi} from '@/lib/cj/availability';
import {cjSyncSettings} from '@/lib/cj/sync';
import {primaryOrigin} from '@/lib/public-origin';
import {quoteCjVat} from '@/lib/cj/tax-quote';

export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const failure=(error:string,status:number)=>NextResponse.json({error},{status,headers});
function trustedOrigin(origin:string|null,url:string):boolean{
  if(origin===primaryOrigin)return true;
  if(process.env.NODE_ENV==='production'||!origin)return false;
  try{const parsed=new URL(url);return ['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)&&origin===parsed.origin;}catch{return false;}
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const session=await getSession();if(!session)return failure('unauthorized',401);
    if(!(await hasAccess(session.uid,'products','view')))return failure('forbidden',403);
    if(!trustedOrigin(request.headers.get('origin'),request.url)||request.headers.get('sec-fetch-site')==='cross-site')return failure('forbidden',403);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return failure('json_required',415);
    const {id:idValue}=await params,id=Number(idValue);if(!Number.isSafeInteger(id)||id<=0)return failure('invalid_product',400);
    const length=request.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>1024))return failure('invalid_request',400);
    let body:Record<string,unknown>;
    try{const parsed=await request.json() as unknown;if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return failure('invalid_request',400);body=parsed as Record<string,unknown>;}catch{return failure('invalid_request',400);}
    if(Object.keys(body).sort().join(',')!=='quantity,variantId'||typeof body.variantId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(body.variantId)||!Number.isSafeInteger(body.quantity)||Number(body.quantity)<1||Number(body.quantity)>99)return failure('invalid_request',400);
    const row=await getStorefrontCjProduct(id,false);if(!row||row.hidden!==0)return failure('unavailable',404);
    const details=parseCjDetails(row),variant=details?.variants.find(item=>item.vid===body.variantId);if(!variant)return failure('variant_unavailable',404);
    const settings=await cjSyncSettings();
    const checked=await verifyCjVariantForSaudi(row.cj_product_id,{vid:variant.vid,variantSku:variant.sku,variantName:variant.name,variantKey:variant.optionKey,variantSellPrice:variant.priceUsd,variantImage:null,variantWeight:variant.weight,attributes:variant.attributes},Number(body.quantity),{},settings.usdToSarX100,{otherCostsMinor:row.other_costs_minor,marginBps:row.margin_bps,saleOverrideMinor:row.sale_price_override_minor});
    if(checked.status!=='available')return NextResponse.json({status:checked.status,checkedAt:checked.checkedAt},{headers});
    const shippingOptions=await Promise.all(checked.shippingOptions.map(async option=>{
      const tax=await quoteCjVat(checked.salePriceMinor,Number(body.quantity),option.priceMinor+option.additionalMinor);
      return {...option,vatEnabled:tax.enabled,vatMinor:tax.vatMinor,totalMinor:tax.totalMinor};
    }));
    return NextResponse.json({...checked,shippingOptions},{headers});
  }catch{
    // Provider detail and credentials never cross the server/client boundary.
    return failure('verification_failed',503);
  }
}
