'use server';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireAccess} from '@/lib/access-control/guards';
import {prisma} from '@/lib/prisma';
import {supplierConfig} from '@/lib/suppliers/config';
import {beginOAuth,disconnectConnection} from '@/lib/suppliers/connections';
import {formId,parseIntegrationControls,parseProductControls,saveIntegration,saveProductControls,addPriceTier,stopProduct} from '@/lib/suppliers/admin';
import {assertSupplierSchemaReady} from '@/lib/suppliers/schema';
import {syncConnection} from '@/lib/suppliers/sync';
import {verifySupplierStoreIdentity} from '@/lib/suppliers/registry';
import {setSetting} from '@/lib/settings';
const path='/admin/suppliers/integrations';
export async function saveTrackingLabels(form:FormData) {
 await requireAccess('shipping', 'manage_settings');
 const keys=['supplier_tracking_title','supplier_tracking_carrier_label','supplier_tracking_number_label','supplier_tracking_status_label','supplier_tracking_notice'];
 const values=keys.map(key=>String(form.get(key)||'').trim());
 if(values.some(value=>!value||value.length>100||/[\u0000-\u001f]/.test(value)))redirect(`${path}?result=save_failed`);
 try {for(let i=0;i<keys.length;i++)await setSetting(keys[i],values[i]);}catch{redirect(`${path}?result=save_failed`);}
 revalidatePath(path);redirect(`${path}?result=saved`);
}
export async function disableProduct(form:FormData) {
 const admin=await requireAccess('products', 'suspend');
 try {await stopProduct(prisma,formId(form),form.get('hide')==='1',BigInt(admin.uid));}catch{redirect(`${path}?result=save_failed`);}
 revalidatePath(path);revalidatePath('/shop');redirect(`${path}?result=saved`);
}
export async function saveProfile(form:FormData) {
 const admin=await requireAccess('integrations', 'manage_settings');
 try {await assertSupplierSchemaReady(prisma);const input=parseIntegrationControls(form);if(input.provider==='salla'&&input.mode==='live')await verifySupplierStoreIdentity(prisma,input.supplierId,supplierConfig());await saveIntegration(prisma,input,BigInt(admin.uid));} catch {redirect(`${path}?result=save_failed`);}
 revalidatePath(path);redirect(`${path}?result=saved`);
}
export async function saveProduct(form:FormData) {
 const admin=await requireAccess('products', 'edit');
 try {await assertSupplierSchemaReady(prisma);await saveProductControls(prisma,parseProductControls(form),BigInt(admin.uid));} catch {redirect(`${path}?result=product_failed`);}
 revalidatePath(path);revalidatePath('/shop');redirect(`${path}?result=saved`);
}
export async function connectSalla(form:FormData) {
 const admin=await requireAccess('integrations', 'authorize');let url:string;
 try {await assertSupplierSchemaReady(prisma);const config=supplierConfig();const result=await beginOAuth(prisma,formId(form,'supplierId'),BigInt(admin.uid),config);url=result.url;const jar=await cookies();jar.set('salla_merchant_context','',{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'lax',path:'/api/integrations/salla/callback',maxAge:0});jar.set('salla_oauth_browser',result.browser,{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'lax',path:'/api/integrations/salla/callback',maxAge:600});} catch {redirect(`${path}?result=connection_failed`);}
 redirect(url);
}
export async function disconnectSalla(form:FormData) {
 await requireAccess('integrations', 'authorize');
 try {await assertSupplierSchemaReady(prisma);await disconnectConnection(prisma,formId(form));} catch {redirect(`${path}?result=save_failed`);}
 revalidatePath(path);revalidatePath('/shop');redirect(`${path}?result=disconnected`);
}
export async function synchronize(form:FormData) {
 await requireAccess('integrations', 'sync');
 try {await assertSupplierSchemaReady(prisma);await syncConnection(prisma,formId(form),supplierConfig());} catch {redirect(`${path}?result=sync_failed`);}
 revalidatePath(path);redirect(`${path}?result=synced`);
}
export async function saveTier(form:FormData) {
 const admin=await requireAccess('pricing', 'manage_settings');
 try {await assertSupplierSchemaReady(prisma);await addPriceTier(prisma,form,BigInt(admin.uid));} catch {redirect(`${path}?result=save_failed`);}
 revalidatePath(path);redirect(`${path}?result=saved`);
}
