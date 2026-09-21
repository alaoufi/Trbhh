'use server';
import {revalidatePath} from 'next/cache';
import {prisma} from '@/lib/prisma';
import {requireAction} from '@/lib/roles';
import {assertSupplierSchemaReady} from '@/lib/suppliers/schema';
import {loadCatalog,loadCatalogDetail,reviewCatalogSelection,approveCatalogSelection,updateCatalogProductSale,hideCatalogProduct,removeCatalogProduct} from '@/lib/suppliers/catalog-admin';
import type {CatalogActions,CatalogSearch,CatalogSelection,CatalogApproval,CatalogSaleUpdate,CatalogRemoval} from '@/lib/suppliers/catalog-selection';

const messages:Record<string,string>={
 catalog_invalid:'تحقق من البحث أو اختيار المورد ثم أعد المحاولة.',
 catalog_selection:'اختر من منتج واحد إلى 50 منتجًا دون تكرار.',
 catalog_missing:'المنتج غير متاح. حدّث قائمة المنتجات.',
 catalog_stale:'تغير منتج أو اتصال المورد، أو أُضيف المنتج سابقًا. حدّث القائمة وأعد المعاينة.',
 catalog_review_expired:'انتهت المعاينة أو تغير الاختيار. أعد المعاينة قبل الاعتماد.',
 catalog_confirmation:'أكد مراجعة المنتجات والأسعار قبل الإضافة.',
 catalog_price:'أدخل تكلفة الاتفاق وسعر البيع لكل منتج بالريال، حتى منزلتين عشريتين.',
 supplier_price_below_minimum:'سعر البيع يجب أن يغطي التكلفة وحدود السعر والربح المعتمدة لكل منتج.',
 invalid_money:'تحقق من مبالغ التكلفة وسعر البيع.',
 supplier_product_conflict:'تغيرت بيانات المنتج. أعد تحميل القائمة ومعاينة الاختيار.',
 catalog_config:'المعاينة غير متاحة حاليًا. راجع إعداد الخادم.',
 catalog_cost_missing:'أضف تكلفة التوريد أولًا قبل تعديل سعر البيع.',
 catalog_remove_confirmation:'أكد حذف المنتج من تربح أولًا.',
 catalog_remove_history:'لا يمكن حذف المنتج لأن له سجل طلبات أو حجوزات. استخدم «إخفاء من تربح» بدلًا من الحذف.',
};
function failure(error:unknown):{error:string}{return {error:messages[error instanceof Error?error.message:'']||'تعذر إكمال العملية. لم تُعتمد إضافة جزئية؛ أعد المحاولة.'};}
const secret=()=>process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY||'';
export async function searchProducts(input:CatalogSearch):ReturnType<CatalogActions['search']>{
 await requireAction('suppliers','view');
 try{await assertSupplierSchemaReady(prisma);return {data:await loadCatalog(prisma,input)};}catch(error){return failure(error);}
}
export async function productDetails(key:string):ReturnType<CatalogActions['details']>{
 await requireAction('suppliers','view');
 try{await assertSupplierSchemaReady(prisma);return {product:await loadCatalogDetail(prisma,key)};}catch(error){return failure(error);}
}
export async function reviewProducts(input:CatalogSelection[]):ReturnType<CatalogActions['review']>{
 await requireAction('suppliers','view');const admin=await requireAction('suppliers','edit');
 try{await assertSupplierSchemaReady(prisma);return {review:await reviewCatalogSelection(prisma,input,BigInt(admin.uid),secret())};}catch(error){return failure(error);}
}
export async function approveProducts(input:CatalogApproval):ReturnType<CatalogActions['approve']>{
 await requireAction('suppliers','view');const admin=await requireAction('suppliers','edit');
 try{
  await assertSupplierSchemaReady(prisma);const result=await approveCatalogSelection(prisma,input,BigInt(admin.uid),secret());
  revalidatePath('/admin/suppliers/catalog');revalidatePath('/admin/suppliers/integrations');
  return result;
 }catch(error){return failure(error);}
}
export async function updateProductSale(input:CatalogSaleUpdate):ReturnType<CatalogActions['updateSale']>{
 await requireAction('suppliers','view');const admin=await requireAction('suppliers','edit');
 try{await assertSupplierSchemaReady(prisma);const result=await updateCatalogProductSale(prisma,input,BigInt(admin.uid));revalidatePath('/admin/suppliers/catalog');revalidatePath('/admin/suppliers/integrations');return result;}catch(error){return failure(error);}
}
export async function hideProduct(input:CatalogSelection):ReturnType<CatalogActions['hide']>{
 await requireAction('suppliers','view');const admin=await requireAction('suppliers','edit');
 try{await assertSupplierSchemaReady(prisma);const result=await hideCatalogProduct(prisma,input,BigInt(admin.uid));revalidatePath('/admin/suppliers/catalog');revalidatePath('/admin/suppliers/integrations');revalidatePath('/shop');return result;}catch(error){return failure(error);}
}
export async function removeProduct(input:CatalogRemoval):ReturnType<CatalogActions['remove']>{
 await requireAction('suppliers','view');const admin=await requireAction('suppliers','edit');
 try{await assertSupplierSchemaReady(prisma);const result=await removeCatalogProduct(prisma,input,BigInt(admin.uid));revalidatePath('/admin/suppliers/catalog');revalidatePath('/admin/suppliers/integrations');revalidatePath('/shop');return result;}catch(error){return failure(error);}
}
