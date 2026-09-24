import {NextResponse} from 'next/server';
import {normalizeCart} from '@/lib/commerce/cart';
import {readPublicCommerceProducts} from '@/lib/commerce/public-product';
import {getCommerceConfig} from '@/lib/commerce/settings';
import {prisma} from '@/lib/prisma';
import {readApprovedFiscalPolicy} from '@/lib/finance/fiscal-policy';
import {quoteFiscalProduct,quoteFiscalShipping} from '@/lib/finance/order-fiscal-snapshot';
import {checkedMoney} from '@/lib/commerce/money';
import {getCommerceGateway} from '@/lib/commerce/runtime';
import {takeSecurityAttempt} from '@/lib/auth-security';

export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{
  const length=Number(request.headers.get('content-length')||0);if(length>100_000)return NextResponse.json({error:'cart_too_large'},{status:413});
  const raw=await request.text();if(Buffer.byteLength(raw,'utf8')>100_000)return NextResponse.json({error:'cart_too_large'},{status:413});
  const body=JSON.parse(raw) as {items?:unknown},items=normalizeCart(body?.items);
  const clientKey=(request.headers.get('x-forwarded-for')||request.headers.get('x-real-ip')||'unknown').split(',')[0].trim().slice(0,80)||'unknown';
  if(!(await takeSecurityAttempt(`commerce-cart-quote:${clientKey}`,60)))return NextResponse.json({error:'rate_limited'},{status:429,headers:{'Cache-Control':'no-store'}});
  const products=await readPublicCommerceProducts(items.map(item=>BigInt(item.productId)));
  const lines=items.map(item=>{
   const product=products.get(item.productId);if(!product)return {productId:item.productId,quantity:item.quantity,title:'منتج غير متاح',image:null,variantName:null,unitPriceMinor:0,totalMinor:0,stock:0,available:false};
   const variant=item.variantKey?product.variants.find(v=>v.key===item.variantKey):undefined;
   const validVariant=product.requiresVariantSelection?!!variant:!item.variantKey;
   const unitPriceMinor=variant?.priceMinor??product.priceMinor,stock=variant?.stock??product.stock;
   return {productId:item.productId,quantity:item.quantity,title:product.title,image:product.images[0]||null,variantName:variant?.name||null,unitPriceMinor,totalMinor:checkedMoney(unitPriceMinor*item.quantity),stock,available:validVariant&&item.quantity<=stock};
  });
  const [config,gateway,policy]=await Promise.all([getCommerceConfig(),getCommerceGateway(),readApprovedFiscalPolicy(prisma,new Date()).catch(()=>null)]);
  let productVatMinor:number|null=null,shippingVatMinor:number|null=null,shippingTotalMinor:number|null=null,totalMinor:number|null=null;
  if(policy){
   const fiscal=lines.filter(line=>line.available).map(line=>quoteFiscalProduct(policy,{key:line.productId,title:line.title,quantity:line.quantity,unitPriceMinor:line.unitPriceMinor}));
   productVatMinor=fiscal.reduce((sum,line)=>sum+line.vatMinor,0);
   if(config.shippingFeeMinor!==null){const shipping=quoteFiscalShipping(policy,config.shippingFeeMinor);shippingVatMinor=shipping.vatMinor;shippingTotalMinor=shipping.grossMinor;totalMinor=checkedMoney([...fiscal.map(line=>line.grossMinor),shipping.grossMinor].reduce((sum,value)=>sum+value,0));}
  }
  const subtotalMinor=lines.filter(line=>line.available).reduce((sum,line)=>checkedMoney(sum+line.totalMinor),0);
  const checkoutReady=config.purchasingEnabled&&config.enabled&&config.paymentsEnabled&&!!gateway?.ready&&config.shippingFeeMinor!==null&&!!config.text.shippingTerms.trim()&&!!policy&&totalMinor!==null;
  return NextResponse.json({lines,subtotalMinor,discountMinor:0,productVatMinor,shippingFeeMinor:config.shippingFeeMinor,shippingVatMinor,shippingTotalMinor,totalMinor,pricingVerified:!!policy&&totalMinor!==null,checkoutReady,deliveryEstimate:null},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'cart_unavailable'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
