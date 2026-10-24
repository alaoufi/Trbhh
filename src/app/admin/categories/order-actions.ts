'use server';
import {requireAccess} from '@/lib/access-control/guards';
import {cacheDel} from '@/lib/redis';import {bustAdCaches} from '@/lib/data';import {revalidatePath} from 'next/cache';
import {readCategoryOrder,persistCategoryOrder} from '@/lib/ad-categories/order-store';
import type {CategoryOrderRequest,CategoryOrderResult} from '@/lib/ad-categories/ordering';
export async function loadCategoryOrderAction(parentId:number|null){await requireAccess('categories','view');return readCategoryOrder(parentId);}
export async function saveCategoryOrderAction(input:CategoryOrderRequest):Promise<CategoryOrderResult>{
 await requireAccess('categories','view');const actor=await requireAccess('categories','edit');
 const items=await persistCategoryOrder(actor.uid,input);
 await cacheDel('categories:active');await bustAdCaches();
 for(const path of ['/','/search','/admin/categories','/ads/new','/cj'])revalidatePath(path);
 return {ok:true,items};
}
