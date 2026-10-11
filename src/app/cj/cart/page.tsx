import {requireAccess} from '@/lib/access-control/guards';
import {TrialCart} from '@/components/cj/trial-cart';
import {listMemberAddresses} from '@/lib/commerce/address-book';

export const dynamic='force-dynamic';
export const metadata={title:'السلة',robots:{index:false,follow:false}};

export default async function CjTrialCartPage(){
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
  return <TrialCart key={session.uid} accountId={session.uid} ship={ship}/>;
}
