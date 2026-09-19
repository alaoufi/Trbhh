'use server';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireAction} from '@/lib/roles';
import {prisma} from '@/lib/prisma';
import {supplierConfig} from '@/lib/suppliers/config';
import {beginOAuth,disconnectConnection} from '@/lib/suppliers/connections';
import {formId,parseIntegrationControls,parseProductControls,saveIntegration,saveProductControls,addPriceTier,stopProduct} from '@/lib/suppliers/admin';
import {assertSupplierSchemaReady} from '@/lib/suppliers/schema';
import {syncConnection} from '@/lib/suppliers/sync';
import {setSetting} from '@/lib/settings';
const path='/admin/suppliers/integrations';
export async function saveTrackingLabels(form:FormData) {
 await requireAction('suppliers','edit');
 const keys=['supplier_tracking_title','supplier_tracking_carrier_label','supplier_tracking_number_label','supplier_tracking_status_label','supplier_tracking_notice'];
 const values=keys.map(key=>String(form.get(key)||'').trim());
 if(values.some(value=>!value||value.length>100||/[\u0000-\u001f]/.test(value)))redirect(`${path}?result=save_failed`);
 try {for(let i=0;i<keys.length;i++)await setSetting(keys[i],values[i]);}catch{redirect(`${path}?result=save_failed`);}
 revalidatePath(path);redirect(`${path}?result=saved`);
}
export async function disableProduct(form:FormData) {
 const admin=await requireAction('suppliers','edit');
 try {await stopProduct(prisma,formId(form),form.get('hide')==='1',BigInt(admin.uid));}catch{redirect(`${path}?result=save_failed`);}
 revalidatePath(path);revalidatePath('/shop');redirect(`${path}?result=saved`);
}
export async function saveProfile(form:FormData) {
 const admin=await requireAction('suppliers','edit');
 try {await assertSupplierSchemaReady(prisma);await saveIntegration(prisma,parseIntegrationControls(form),BigInt(admin.uid));} catch {redirect(`${path}?result=save_failed`);}
 revalidatePath(path);redirect(`${path}?result=saved`);
}
export async function saveProduct(form:FormData) {
 const admin=await requireAction('suppliers','edit');
 try {await assertSupplierSchemaReady(prisma);await saveProductControls(prisma,parseProductControls(form),BigInt(admin.uid));} catch {redirect(`${path}?result=product_failed`);}
 revalidatePath(path);revalidatePath('/shop');redirect(`${path}?result=saved`);
}
export async function connectSalla(form:FormData) {
 const admin=await requireAction('suppliers','edit');let url:string;
 try {await assertSupplierSchemaReady(prisma);const config=supplierConfig();const result=await beginOAuth(prisma,formId(form,'supplierId'),BigInt(admin.uid),config);url=result.url;(await cookies()).set('salla_oauth_browser',result.browser,{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'lax',path:'/api/integrations/salla/callback',maxAge:600});} catch {redirect(`${path}?result=connection_failed`);}
 redirect(url);
}
export async function disconnectSalla(form:FormData) {
 await requireAction('suppliers','edit');
 try {await assertSupplierSchemaReady(prisma);await disconnectConnection(prisma,formId(form));} catch {redirect(`${path}?result=save_failed`);}
 revalidatePath(path);revalidatePath('/shop');redirect(`${path}?result=disconnected`);
}
export async function synchronize(form:FormData) {
 await requireAction('suppliers','edit');
 try {await assertSupplierSchemaReady(prisma);await syncConnection(prisma,formId(form),supplierConfig());} catch {redirect(`${path}?result=sync_failed`);}
 revalidatePath(path);redirect(`${path}?result=synced`);
}
export async function saveTier(form:FormData) {
 const admin=await requireAction('suppliers','edit');
 try {await assertSupplierSchemaReady(prisma);await addPriceTier(prisma,form,BigInt(admin.uid));} catch {redirect(`${path}?result=save_failed`);}
 revalidatePath(path);redirect(`${path}?result=saved`);
}
