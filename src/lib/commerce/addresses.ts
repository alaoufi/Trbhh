import {saudiCommercePhone} from './config';

export type SaudiAddressInput={
  label:string;fullName:string;phone:string;alternatePhone:string;email:string;country:string;region:string;city:string;
  district:string;street:string;buildingNumber:string;secondaryNumber:string;postalCode:string;shortAddress:string;deliveryNotes:string;
  lat?:string;lng?:string;
};
export type SaudiAddressSnapshot=Omit<SaudiAddressInput,'phone'|'alternatePhone'|'country'|'lat'|'lng'>&{
  phone:string;alternatePhone:string|null;country:'SA';lat:string;lng:string;
};

const limits={label:40,fullName:120,email:254,region:100,city:100,district:120,street:200,buildingNumber:20,secondaryNumber:20,postalCode:5,shortAddress:16,deliveryNotes:500} as const;
const required=['fullName','phone','region','city','district','street','buildingNumber','postalCode'] as const;

function text(value:unknown,key:keyof typeof limits,optional=false):string{
  if(typeof value!=='string')throw new Error('address_field_invalid');
  const normalized=value.trim();
  if((!optional&&!normalized)||normalized.length>limits[key]||/[\u0000-\u001f\u007f]/.test(normalized))throw new Error('address_field_invalid');
  return normalized;
}

/** إحداثيات اختيارية من الخريطة (موقعي الحالي أو رابط Google Maps). فارغة = لا تحديد. */
function coord(value:unknown,kind:'lat'|'lng'):string{
  const s=typeof value==='string'?value.trim():'';
  if(!s)return '';
  const n=Number(s);
  if(!Number.isFinite(n)||Math.abs(n)>(kind==='lat'?90:180))throw new Error('address_field_invalid');
  return String(Math.round(n*1e6)/1e6);
}

/** Strict server-side normalization shared by address CRUD and order snapshots. */
export function normalizeSaudiAddress(input:SaudiAddressInput):SaudiAddressSnapshot{
  if(!input||typeof input!=='object')throw new Error('address_invalid');
  for(const key of required)if(typeof input[key]!=='string'||!input[key].trim())throw new Error(`address_${key}_required`);
  if(input.country!=='SA')throw new Error('address_country_invalid');
  const phone=saudiCommercePhone(input.phone);
  if(!phone)throw new Error('address_phone_invalid');
  const alternate=input.alternatePhone.trim()?saudiCommercePhone(input.alternatePhone):null;
  if(input.alternatePhone.trim()&&!alternate)throw new Error('address_alternate_phone_invalid');
  const email=text(input.email,'email',true);
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('address_email_invalid');
  return{
    label:text(input.label,'label',true)||'عنواني',fullName:text(input.fullName,'fullName'),phone:`+${phone}`,
    alternatePhone:alternate?`+${alternate}`:null,email,country:'SA',region:text(input.region,'region'),city:text(input.city,'city'),
    district:text(input.district,'district'),street:text(input.street,'street'),buildingNumber:text(input.buildingNumber,'buildingNumber'),
    secondaryNumber:text(input.secondaryNumber,'secondaryNumber',true),postalCode:text(input.postalCode,'postalCode'),
    shortAddress:shortAddress(input.shortAddress),deliveryNotes:text(input.deliveryNotes,'deliveryNotes',true),
    lat:coord(input.lat,'lat'),lng:coord(input.lng,'lng'),
  };
}

/** العنوان الوطني المختصر: ٤ أحرف + ٤ أرقام (مثل QDMA9340). اختياري؛ فارغ = لا شيء. */
function shortAddress(value:unknown):string{
  const raw=(typeof value==='string'?value:'').trim().toUpperCase();
  if(!raw)return '';
  if(!/^[A-Z]{4}\d{4}$/.test(raw))throw new Error('address_short_invalid');
  return raw;
}

export function formatAddressLine(address:SaudiAddressSnapshot):string{
  return [address.district,address.street,address.buildingNumber,address.secondaryNumber,address.shortAddress,address.deliveryNotes]
    .filter(Boolean).join('، ');
}
