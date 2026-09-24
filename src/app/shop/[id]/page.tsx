import {notFound} from 'next/navigation';
import {getCommerceConfig} from '@/lib/commerce/settings';
import {prisma} from '@/lib/prisma';
import {readPublicCommerceProduct} from '@/lib/commerce/public-product';
import {readApprovedFiscalPolicy} from '@/lib/finance/fiscal-policy';
import {CommerceProductDetail} from '@/components/commerce/product-detail';

export const dynamic='force-dynamic';
export default async function CommerceProductPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[1-9]\d{0,14}$/.test(id))notFound();
 const [config,product]=await Promise.all([getCommerceConfig(),readPublicCommerceProduct(BigInt(id))]);
 if(!config.enabled||!product)notFound();
 const policy=await readApprovedFiscalPolicy(prisma,new Date()).catch(()=>null);
 const calculation=policy?.calculationPolicy;
 return <CommerceProductDetail product={product} shippingFeeMinor={config.shippingFeeMinor} priceBasis={calculation?.priceBasis||null} purchasingEnabled={config.purchasingEnabled} shippingTerms={config.text.shippingTerms}/>;
}
