import {notFound} from 'next/navigation';
import {getCommerceConfig} from '@/lib/commerce/settings';
import {prisma} from '@/lib/prisma';
import {readPublicCommerceProduct,readSimilarPublicCommerceProducts} from '@/lib/commerce/public-product';
import {readApprovedFiscalPolicy} from '@/lib/finance/fiscal-policy';
import {CommerceProductDetail} from '@/components/commerce/product-detail';

export const dynamic='force-dynamic';
export default async function CommerceProductPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[1-9]\d{0,14}$/.test(id))notFound();
 const config=await getCommerceConfig();if(!config.enabled)notFound();
 const product=await readPublicCommerceProduct(BigInt(id));if(!product)notFound();
 const policy=await readApprovedFiscalPolicy(prisma,new Date()).catch(()=>null);
 const calculation=policy?.calculationPolicy;
 const vatEnabled=policy?(calculation?.vatControl?.enabled??policy.vatBps>0):false;
 const similar=await readSimilarPublicCommerceProducts(BigInt(id),4).catch(()=>[]);
 return <CommerceProductDetail product={product} similar={similar} shippingFeeMinor={config.shippingFeeMinor} priceBasis={vatEnabled?(calculation?.priceBasis||null):null} purchasingEnabled={config.purchasingEnabled} shippingTerms={config.text.shippingTerms}/>;
}
