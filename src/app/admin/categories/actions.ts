'use server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { requireAction } from '@/lib/roles';
import { setSetting } from '@/lib/settings';
import { cacheDelPattern } from '@/lib/redis';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import catalog from '@/domain/category-catalog.json';
import { categoryOptions } from '@/lib/categories-v2';
import { chooseCategory } from '@/domain/category-fields';
const val=(f:FormData,k:string)=>String(f.get(k)||'').trim();
const num=(f:FormData,k:string)=>{const n=Number(val(f,k));if(!Number.isSafeInteger(n)||n<0)throw new Error('رقم غير صالح');return n;};
async function refresh(){await cacheDelPattern('categories:*');await cacheDelPattern('ads:*');await cacheDelPattern('search:*');revalidatePath('/','layout');}
async function audit(tx:Prisma.TransactionClient,uid:number,action:string,target:string) {await tx.admin_log.create({data:{admin_id:BigInt(uid),action,target}});}
export async function saveCategorySettings(f:FormData){
  await requireAction('categories','edit');
  await setSetting('categories_v2_on',f.get('enabled')?'1':'0');
  for(const key of ['title','intro','category_label','branch_label','details_label']) await setSetting('categories_v2_'+key,val(f,key).slice(0,500));
  await refresh();
}
export async function initializeCategories(){
  const session=await requireAction('categories','add');
  await prisma.$transaction(async tx=>{
    for(let index=0;index<catalog.length;index++){
      const item=catalog[index];
      let cat=await tx.categories.findFirst({where:{name:item.name}});
      if(!cat&&item.name==='أخرى')cat=await tx.categories.findFirst({where:{name:'عروض أخرى'}});
      if(!cat)cat=await tx.categories.create({data:{name:item.name,photo_path:'',is_active:'yes',ordered:catalog.length-index}});
      for(const [i,name] of item.branches.entries()) if(!await tx.sub_categories.findFirst({where:{category_id:Number(cat.id),name}}))await tx.sub_categories.create({data:{category_id:Number(cat.id),name,order:i,active:1}});
      for(const [i,field] of item.fields.entries())await tx.category_field_defs.upsert({where:{category_id_field_key:{category_id:cat.id,field_key:field.key}},create:{category_id:cat.id,field_key:field.key,label:field.label,field_type:field.type,options:field.options,required:0,ordered:i},update:{}});
    }
    await audit(tx,session.uid,'categories_initialize','catalog');
  },{timeout:30000});await refresh();
}
export async function saveCategory(f:FormData){
  const id=num(f,'id');const session=await requireAction('categories',id?'edit':'add');
  const name=val(f,'name').slice(0,120);if(!name)return;
  await prisma.$transaction(async tx=>{
    const data={name,is_active:f.get('active')?'yes':'no',ordered:Math.min(10000,num(f,'ordered'))};
    const cat=id?await tx.categories.update({where:{id:BigInt(id)},data}):await tx.categories.create({data:{...data,photo_path:''}});
    await audit(tx,session.uid,'category_save',String(cat.id));
  });await refresh();
}
export async function saveBranch(f:FormData){
  const id=num(f,'id'),categoryId=num(f,'categoryId');const session=await requireAction('categories',id?'edit':'add');
  if(!categoryId||!await prisma.categories.findUnique({where:{id:BigInt(categoryId)}}))return;
  const name=val(f,'name').slice(0,120);if(!name)return;
  await prisma.$transaction(async tx=>{
    const data={name,active:f.get('active')?1:0,order:num(f,'ordered')};
    if(id)await tx.sub_categories.updateMany({where:{id:BigInt(id),category_id:categoryId},data});
    else await tx.sub_categories.create({data:{...data,category_id:categoryId}});
    await audit(tx,session.uid,'category_branch_save',String(categoryId));
  });await refresh();
}
export async function saveField(f:FormData){
  const id=num(f,'id'),categoryId=num(f,'categoryId');const session=await requireAction('categories',id?'edit':'add');
  const label=val(f,'label').slice(0,120),key=val(f,'key');const type=val(f,'type');
  if(!label||! /^[a-z][a-z0-9_]{0,63}$/.test(key)||!['text','number','select'].includes(type))redirect('/admin/categories?error=field');
  const options=val(f,'options').split('|').map(s=>s.trim()).filter(Boolean).slice(0,100).join('|');
  if(options.length>5000||(type==='select'&&!options))redirect('/admin/categories?error=field');
  await prisma.$transaction(async tx=>{
    const data={label,field_type:type,options,required:f.get('required')?1:0,active:f.get('active')?1:0,ordered:num(f,'ordered')};
    if(id)await tx.category_field_defs.updateMany({where:{id:BigInt(id),category_id:BigInt(categoryId)},data});
    else await tx.category_field_defs.upsert({where:{category_id_field_key:{category_id:BigInt(categoryId),field_key:key}},create:{...data,category_id:BigInt(categoryId),field_key:key},update:data});
    await audit(tx,session.uid,'category_field_save',String(categoryId));
  });await refresh();
}

export async function prepareClassification(f:FormData){
  const session=await requireAction('categories','edit');
  const cats=await categoryOptions();
  const fallback=cats.find(c=>['أخرى','عروض أخرى'].includes(c.name));
  if(!fallback)redirect('/admin/categories?error=initialize');
  const after=num(f,'after');
  const ads=await prisma.ads.findMany({where:{id:{gt:BigInt(after)}},orderBy:{id:'asc'},take:100,select:{id:true,title:true,detail:true,category_id:true,subcategory_id:true,cat_reviewed:true}});
  const candidates=cats.filter(c=>c.active).map(c=>({id:c.id,name:c.name,keywords:catalog.find(x=>x.name===c.name)?.keywords||[c.name]}));
  const batch=await prisma.$transaction(async tx=>{
    const b=await tx.category_migration_batches.create({data:{created_by:BigInt(session.uid),total_count:ads.length}});
    for(const ad of ads){const r=chooseCategory(ad.title,ad.detail,candidates,fallback.id);
      await tx.category_migration_suggestions.create({data:{batch_id:b.id,ad_id:ad.id,category_id:BigInt(r.categoryId),confidence:r.confidence,matched:JSON.stringify(r.matched),previous_category_id:ad.category_id,previous_subcategory_id:ad.subcategory_id,previous_reviewed:ad.cat_reviewed}});
    }
    await audit(tx,session.uid,'category_batch_prepare',String(b.id));return b;
  });
  // Automatic application is opt-in for this batch, after the administrator sees the rule.
  if(f.get('auto'))await applyBatch(batch.id,session.uid,[],null,null,true);
  await refresh();redirect(`/admin/categories/review?batch=${batch.id}`);
}
async function applyBatch(batchId:bigint,uid:number,ids:bigint[],categoryId:bigint|null,sub:number|null,auto=false){
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM category_migration_batches WHERE id=${batchId} FOR UPDATE`;
    const rows=await tx.category_migration_suggestions.findMany({where:{batch_id:batchId,status:'pending',...(auto?{confidence:{gte:0.85}}:{id:{in:ids}})},take:100});
    let applied=0;
    for(const r of rows){
      const target=categoryId||r.category_id;if(!target)continue;
      const cat=await tx.categories.findUnique({where:{id:target}});if(!cat||cat.is_active!=='yes')continue;
      const targetSub=categoryId?sub:r.subcategory_id;
      if(targetSub&&!await tx.sub_categories.findFirst({where:{id:BigInt(targetSub),category_id:Number(target),active:1}}))throw new Error('فرع غير صالح');
      await tx.$queryRaw`SELECT id FROM ads WHERE id=${r.ad_id} FOR UPDATE`;
      const ad=await tx.ads.findUnique({where:{id:r.ad_id}});
      if(!ad||ad.category_id!==r.previous_category_id||ad.subcategory_id!==r.previous_subcategory_id||ad.cat_reviewed!==r.previous_reviewed){await tx.category_migration_suggestions.update({where:{id:r.id},data:{status:'conflict'}});continue;}
      const changed=await tx.ads.update({where:{id:ad.id},data:{category_id:target,subcategory_id:targetSub,cat_reviewed:1,updated_at:new Date()}});
      await tx.category_migration_suggestions.update({where:{id:r.id},data:{status:'applied',applied_category_id:target,applied_subcategory_id:targetSub,applied_updated_at:changed.updated_at,reviewed_by:BigInt(uid),reviewed_at:new Date()}});applied++;
    }
    await tx.category_migration_batches.update({where:{id:batchId},data:{status:'review',applied_count:{increment:applied},applied_at:new Date()}});
    await audit(tx,uid,'category_batch_apply',String(batchId));
  },{timeout:30000});
}
export async function applyClassification(f:FormData){
  const session=await requireAction('categories','edit');
  const ids=f.getAll('selected').map(String).filter(s=>/^\d+$/.test(s)).slice(0,100).map(BigInt);
  if(!ids.length)return;
  const categoryId=num(f,'categoryId');
  await applyBatch(BigInt(num(f,'batch')),session.uid,ids,categoryId?BigInt(categoryId):null,num(f,'sub')||null);await refresh();
}
export async function rollbackClassification(f:FormData){
  const session=await requireAction('categories','edit'),batchId=BigInt(num(f,'batch'));
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM category_migration_batches WHERE id=${batchId} FOR UPDATE`;
    const rows=await tx.category_migration_suggestions.findMany({where:{batch_id:batchId,status:'applied'},take:100});let restored=0;
    for(const r of rows){
      await tx.$queryRaw`SELECT id FROM ads WHERE id=${r.ad_id} FOR UPDATE`;
      const ad=await tx.ads.findUnique({where:{id:r.ad_id}});
      if(!ad||ad.category_id!==r.applied_category_id||ad.subcategory_id!==r.applied_subcategory_id||ad.updated_at?.getTime()!==r.applied_updated_at?.getTime())continue;
      await tx.ads.update({where:{id:ad.id},data:{category_id:r.previous_category_id!,subcategory_id:r.previous_subcategory_id,cat_reviewed:r.previous_reviewed??1,updated_at:new Date()}});
      await tx.category_migration_suggestions.update({where:{id:r.id},data:{status:'reverted'}});restored++;
    }
    await tx.category_migration_batches.update({where:{id:batchId},data:{applied_count:{decrement:restored}}});
    await audit(tx,session.uid,'category_batch_rollback',String(batchId));
  },{timeout:30000});await refresh();
}
