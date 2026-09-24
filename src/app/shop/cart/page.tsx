import {PurchaseCart} from '@/components/commerce/purchase-cart-client';
import {getSession} from '@/lib/auth';
import {listMemberAddresses} from '@/lib/commerce/address-book';

export const dynamic='force-dynamic';
export const metadata={title:'سلة مشترياتك | تربح'};
export default async function CommerceCartPage(){
 const session=await getSession().catch(()=>null);
 const saved=session?await listMemberAddresses(BigInt(session.uid)).catch(()=>[]):[];
 const addresses=saved.map(item=>({id:item.id.toString(),label:item.label,isDefault:item.isDefault,snapshot:item.snapshot}));
 return <PurchaseCart addresses={addresses} signedIn={!!session}/>;
}
