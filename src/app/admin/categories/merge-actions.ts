'use server';
import {requireAccess} from '@/lib/access-control/guards';
import {categoryId} from '@/lib/ad-categories/contracts';
import {CategoryValidationError} from '@/lib/ad-categories/validation';
import {previewCategoryMerge,mergeCategories,type CategoryMergePreview} from '@/lib/ad-categories/merge';
import {cacheDel} from '@/lib/redis';
import {bustAdCaches} from '@/lib/data';
import {revalidatePath} from 'next/cache';
async function guard(){await requireAccess('categories','view');await requireAccess('categories','edit');return requireAccess('categories','delete');}
export async function previewCategoryMergeAction(source:number,target:number):Promise<{ok:boolean;preview?:CategoryMergePreview;error?:string}>{
 await guard();try{return {ok:true,preview:await previewCategoryMerge(categoryId(source),categoryId(target))};}catch(e){return {ok:false,error:e instanceof CategoryValidationError?e.message:'تعذر إعداد المعاينة. لم تُغيّر أي بيانات.'};}
}
export async function applyCategoryMergeAction(source:number,target:number,token:string):Promise<{ok:boolean;error?:string}>{
 const actor=await guard();try{await mergeCategories(actor.uid,categoryId(source),categoryId(target),token);}catch(e){return {ok:false,error:e instanceof CategoryValidationError?e.message:'تعذر تأكيد الدمج. حدّث العرض للتحقق من الحالة قبل إعادة المحاولة.'};}
 await cacheDel('categories:active');await bustAdCaches();revalidatePath('/admin/categories');revalidatePath('/admin/ads');revalidatePath('/');return {ok:true};
}
