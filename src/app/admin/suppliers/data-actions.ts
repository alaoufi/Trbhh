'use server';
import type {Prisma} from '@prisma/client';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {prisma} from '@/lib/prisma';
import {requireAction} from '@/lib/roles';
import type {CommerceDb} from '@/lib/commerce/types';
import {approveSubmittedSupplierData,reopenSupplierDataInvitation} from '@/lib/suppliers/data-invitations';
import {inspectOnboarding,saveOnboarding} from '@/lib/suppliers/onboarding-store';
import type {OnboardingValues} from '@/lib/suppliers/onboarding-fields';

function ids(form:FormData){const supplier=String(form.get('supplierId')||''),generation=String(form.get('generation')||'');if(!/^[1-9]\d{0,14}$/.test(supplier)||!/^[1-9]\d{0,9}$/.test(generation))throw Error('supplier_data_review_stale');return {supplierId:BigInt(supplier),generation:Number(generation)};}
function nestedDb(tx:Prisma.TransactionClient):CommerceDb {
 return {$queryRaw:tx.$queryRaw.bind(tx),$transaction:async(callback:unknown)=>{if(typeof callback!=='function')throw Error('supplier_data_transaction');return (callback as (value:Prisma.TransactionClient)=>Promise<unknown>)(tx);}} as unknown as CommerceDb;
}
const refresh=()=>{revalidatePath('/admin/suppliers');revalidatePath('/admin/suppliers/integrations');};
export async function approveSupplierData(form:FormData){
 const session=await requireAction('suppliers','edit');
 try{
  const {supplierId,generation}=ids(form),secret=process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY||'';
  await approveSubmittedSupplierData(prisma,supplierId,generation,BigInt(session.uid),secret,async(tx,values:OnboardingValues)=>{
   const inner=nestedDb(tx),preview=await inspectOnboarding(inner,values,secret,supplierId);
   await saveOnboarding(inner,{values,fingerprint:preview.fingerprint,filename:'رابط بيانات المورد',auditAction:'اعتماد بيانات مورد من الرابط',explicitSupplierId:supplierId,activateSupplier:true,adminId:BigInt(session.uid),secret,canCreate:false,canEdit:true});
  });
  refresh();redirect('/admin/suppliers?data=approved');
 }catch(error){if(error&&typeof error==='object'&&'digest' in error)throw error;redirect('/admin/suppliers?error=data_review');}
}
export async function reopenSupplierData(form:FormData){
 const session=await requireAction('suppliers','edit');
 try{const {supplierId,generation}=ids(form);await reopenSupplierDataInvitation(prisma,supplierId,generation,BigInt(session.uid));refresh();redirect('/admin/suppliers?data=reopened');}
 catch(error){if(error&&typeof error==='object'&&'digest' in error)throw error;redirect('/admin/suppliers?error=data_review');}
}
