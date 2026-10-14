import {hasAccess,requireAccess} from '@/lib/access-control/guards';
import {TrialCart} from '@/components/cj/trial-cart';
import {listMemberAddresses} from '@/lib/commerce/address-book';
import {getCommerceConfig} from '@/lib/commerce/settings';
import {cjCheckoutFeedback} from '@/lib/cj/checkout-feedback';

export const dynamic='force-dynamic';
export const metadata={title:'السلة',robots:{index:false,follow:false}};

export default async function CjTrialCartPage({searchParams}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}={}){
  const session=await requireAccess('products','view');
  // عنوان الشحن من ملف العضو (دفتر عناوينه) — لا إدخال يدوي.
  const addresses=await listMemberAddresses(BigInt(session.uid)).catch(()=>[]);
  const def=addresses.find(a=>a.isDefault)||addresses[0]||null;
  const ship=def?{
    name:def.snapshot.fullName||'',
    phone:def.snapshot.phone||'',
    city:def.snapshot.city||'',
    region:def.snapshot.region||'',
    address1:[def.snapshot.district,def.snapshot.street,def.snapshot.buildingNumber].filter(Boolean).join('، '),
    address2:def.snapshot.postalCode?`الرمز البريدي ${def.snapshot.postalCode}`:'',
  }:null;
  const outcome=(await searchParams)?.order;
  const feedback=cjCheckoutFeedback(outcome);
  const setupHref=outcome==='fiscal'&&await hasAccess(session.uid,'tax','view')?'/admin/finance?section=tax':null;
  const cart=<TrialCart key={session.uid} accountId={session.uid} ship={ship} checkoutMessage={feedback} setupHref={setupHref}/>;
  if(outcome==='unavailable'){
    const config=await getCommerceConfig();
    return <><p role="alert" className="mx-auto mt-4 max-w-4xl rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">{config.text.paymentUnavailable}</p>{cart}</>;
  }

  return cart;
}
