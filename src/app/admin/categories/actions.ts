'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {prisma} from '@/lib/prisma';
import {requireAccess} from '@/lib/access-control/guards';
import {setSetting} from '@/lib/settings';
import {bustAdCaches} from '@/lib/data';
import {categoryId,CATEGORY_LABELS} from '@/lib/ad-categories/contracts';
import {parseSubcategoryDefinition} from '@/lib/ad-categories/admin-input';
import {CategoryValidationError} from '@/lib/ad-categories/validation';

async function refresh(){await bustAdCaches();revalidatePath('/admin/categories');revalidatePath('/ads/new');revalidatePath('/ads/[id]','page');revalidatePath('/companies/[id]/p/[adId]','page');}
function nameAndOrder(fd:FormData){const name=String(fd.get('name')||'').trim(),order=Number(fd.get('order')||0);if(!name||name.length>200||!Number.isSafeInteger(order)||order<0||order>10000)throw new CategoryValidationError('','الاسم أو الترتيب غير صالح');return {name,order};}
export async function saveCategorySettings(fd:FormData){
  await requireAccess('categories', 'manage_settings');
  await setSetting('categories_v2_enabled',fd.get('enabled')==='1'?'1':'0');
  for(const [k,fallback] of Object.entries(CATEGORY_LABELS)) await setSetting(`categories_v2_label_${k}`,String(fd.get(`label_${k}`)||fallback).trim().slice(0,500));
  await refresh();redirect('/admin/categories?saved=1');
}
export async function saveCategory(fd:FormData){
  const id=fd.get('id')?categoryId(fd.get('id')):null;
  const actor=await requireAccess('categories',id?'edit':'create');
  try{
    const {name,order}=nameAndOrder(fd);
    await prisma.$transaction(async tx=>{
      const c=id?await tx.categories.update({where:{id:BigInt(id)},data:{name,ordered:order}}):await tx.categories.create({data:{name,ordered:order,photo_path:'',is_active:'no'}});
      await tx.$executeRaw`INSERT INTO ad_category_audit(actor_id,action,payload) VALUES (${actor.uid},'save_category',${JSON.stringify({id:Number(c.id),name,order})})`;
    });
  }catch(e){if(e instanceof CategoryValidationError)redirect('/admin/categories?error=input');throw e;}
  await refresh();redirect('/admin/categories?saved=1');
}
export async function toggleCategory(fd:FormData){
  const actor=await requireAccess('categories','suspend');const id=categoryId(fd.get('id'));const sub=fd.get('sub')==='1';const active=fd.get('active')==='1';
  await prisma.$transaction(async tx=>{
    if(sub)await tx.sub_categories.update({where:{id:BigInt(id)},data:{active:active?1:0}});
    else await tx.categories.update({where:{id:BigInt(id)},data:{is_active:active?'yes':'no'}});
    await tx.$executeRaw`INSERT INTO ad_category_audit(actor_id,action,payload) VALUES (${actor.uid},'visibility',${JSON.stringify({id,sub,active})})`;
  });await refresh();redirect('/admin/categories?saved=1');
}
export async function saveSubcategory(fd:FormData){
  const id=fd.get('id')?categoryId(fd.get('id')):null;
  const actor=await requireAccess('categories',id?'edit':'create');
  try{
    const {name,order}=nameAndOrder(fd),cid=categoryId(fd.get('category_id')),def=parseSubcategoryDefinition(fd);
    await prisma.$transaction(async tx=>{
      const cats=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM categories WHERE id=${cid} FOR SHARE`;
      if(!cats.length)throw new CategoryValidationError('','القسم غير موجود');
      let sid:bigint;
      if(id){
        const subs=await tx.$queryRaw<{category_id:number}[]>`SELECT category_id FROM sub_categories WHERE id=${id} FOR UPDATE`;
        if(!subs.length||subs[0].category_id!==cid)throw new CategoryValidationError('','لا يمكن نقل القسم الفرعي');
        const defs=await tx.$queryRaw<{version:number}[]>`SELECT version FROM ad_category_definitions WHERE subcategory_id=${id} FOR UPDATE`;
        if(Number(fd.get('version'))!==(defs[0]?.version??0))throw new CategoryValidationError('','تغيّر التعريف');
        sid=BigInt(id);await tx.sub_categories.update({where:{id:sid},data:{name,order}});
      }else sid=(await tx.sub_categories.create({data:{name,order,category_id:cid,active:0}})).id;
      await tx.$executeRaw`INSERT INTO ad_category_definitions(subcategory_id,version,kind,price_enabled,goods_enabled,fields_json) VALUES (${sid},1,${def.kind},${Number(def.priceEnabled)},${Number(def.goodsEnabled)},${JSON.stringify(def.fields)}) ON DUPLICATE KEY UPDATE version=version+1,kind=VALUES(kind),price_enabled=VALUES(price_enabled),goods_enabled=VALUES(goods_enabled),fields_json=VALUES(fields_json)`;
      await tx.$executeRaw`INSERT INTO ad_category_audit(actor_id,action,payload) VALUES (${actor.uid},'save_subcategory',${JSON.stringify({id:Number(sid),categoryId:cid,name,...def})})`;
    });
  }catch(e){if(e instanceof CategoryValidationError)redirect('/admin/categories?error=input');throw e;}
  await refresh();redirect('/admin/categories?saved=1');
}
