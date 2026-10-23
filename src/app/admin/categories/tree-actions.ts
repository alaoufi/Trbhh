'use server';
import {prisma} from '@/lib/prisma';
import {requireAccess} from '@/lib/access-control/guards';
import {categoryId} from '@/lib/ad-categories/contracts';
import {CategoryValidationError} from '@/lib/ad-categories/validation';
import {deleteEmptyCategoryNode,deleteTreeAd} from '@/lib/ad-categories/tree-deletion';
import {bustAdCaches} from '@/lib/data';
import {revalidatePath} from 'next/cache';
import {timeAgo} from '@/lib/utils';
export type CategoryTreeAd={id:string;title:string;age:string;date:string|null;archived:boolean};
export async function loadCategoryTreeAds(category:number,subcategory:number|null,cursor?:string):Promise<{items:CategoryTreeAd[];next:string|null}>{
 await requireAccess('categories','view');await requireAccess('ads','view');
 const cid=categoryId(category);const sid=subcategory===null?null:categoryId(subcategory);
 if(cursor&&!/^[1-9]\d{0,19}$/.test(cursor))throw new Error('invalid_cursor');
 const children=await prisma.sub_categories.findMany({where:{category_id:cid},select:{id:true}});
 if(sid&&!children.some(s=>Number(s.id)===sid))throw new Error('invalid_subcategory');
 const rows=await prisma.ads.findMany({where:{...(sid?{subcategory_id:sid}:{category_id:BigInt(cid),OR:[{subcategory_id:null},{subcategory_id:{notIn:children.map(s=>Number(s.id))}}]}),...(cursor?{id:{lt:BigInt(cursor)}}:{})},orderBy:{id:'desc'},take:26,select:{id:true,title:true,created_at:true,data_archive:true}});
 return {items:rows.slice(0,25).map(a=>({id:String(a.id),title:a.title,age:timeAgo(a.created_at)||'تاريخ الإضافة غير متاح',date:a.created_at?.toISOString()??null,archived:Boolean(a.data_archive?.trim())})),next:rows.length>25?String(rows[24].id):null};
}
async function refreshTree(){await bustAdCaches();revalidatePath('/admin/categories');revalidatePath('/admin/ads');revalidatePath('/');}
export async function removeEmptyTreeNode(id:number,parentId:number|null):Promise<{ok:boolean;error?:string}>{
 const actor=await requireAccess('categories','delete');
 try{await deleteEmptyCategoryNode(actor.uid,categoryId(id),parentId===null?null:categoryId(parentId));}
 catch(e){if(e instanceof CategoryValidationError)return {ok:false,error:e.message};return {ok:false,error:'تعذر الحذف. لم يتم تأكيد العملية؛ حدّث العرض للتحقق قبل المحاولة مجدداً.'};}
 await refreshTree();return {ok:true};
}
export async function removeCategoryTreeAd(id:string,mode:'archive'|'delete'):Promise<{ok:boolean;deleted?:boolean;archived?:boolean;error?:string}>{
 await requireAccess('categories','view');
 if(!['archive','delete'].includes(mode)||!/^[1-9]\d{0,19}$/.test(id))return {ok:false,error:'معرف الإعلان غير صالح'};
 await requireAccess('ads','view');
 const actor=await requireAccess('ads',mode==='archive'?'archive':'delete');
 try{const result=await deleteTreeAd(actor.uid,BigInt(id),mode);await refreshTree();return {ok:true,...result};}
 catch(e){return {ok:false,error:e instanceof CategoryValidationError?e.message:'تعذر تأكيد الحذف. حدّث العرض للتحقق من الحالة قبل إعادة المحاولة.'};}
}
