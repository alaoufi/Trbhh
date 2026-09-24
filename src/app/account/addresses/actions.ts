'use server';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {saveMemberAddress,setMemberDefaultAddress,deleteMemberAddress} from '@/lib/commerce/address-book';
import type {SaudiAddressInput} from '@/lib/commerce/addresses';

function id(form:FormData):bigint|null{const value=String(form.get('addressId')||'');return /^[1-9]\d{0,19}$/.test(value)?BigInt(value):null;}
export async function saveAddressAction(form:FormData):Promise<void>{
  const session=await requireUser();
  const input=Object.fromEntries(['label','fullName','phone','alternatePhone','email','country','region','city','district','street','buildingNumber','secondaryNumber','postalCode','shortAddress','deliveryNotes'].map(key=>[key,String(form.get(key)||'')])) as unknown as SaudiAddressInput;
  try{await saveMemberAddress(BigInt(session.uid),input,form.get('isDefault')==='1');}
  catch(error){const code=error instanceof Error?error.message:'address_invalid';redirect(`/account/addresses?error=${encodeURIComponent(code)}`);}
  revalidatePath('/account/addresses');
  redirect('/account/addresses?saved=1');
}
export async function setDefaultAddressAction(form:FormData):Promise<void>{
  const session=await requireUser(),addressId=id(form);if(!addressId)redirect('/account/addresses?error=address_invalid');
  try{await setMemberDefaultAddress(BigInt(session.uid),addressId);}catch{redirect('/account/addresses?error=address_not_found');}
  revalidatePath('/account/addresses');redirect('/account/addresses?default=1');
}
export async function deleteAddressAction(form:FormData):Promise<void>{
  const session=await requireUser(),addressId=id(form);if(!addressId)redirect('/account/addresses?error=address_invalid');
  try{await deleteMemberAddress(BigInt(session.uid),addressId);}catch{redirect('/account/addresses?error=address_not_found');}
  revalidatePath('/account/addresses');redirect('/account/addresses?deleted=1');
}
