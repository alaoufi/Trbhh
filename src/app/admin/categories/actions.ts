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
import {validateDefinition} from '@/lib/ad-categories/validation';
import {planCategoryFieldChanges,type FieldChange} from '@/lib/ad-categories/shared-fields';
import type {SubcategoryOption} from '@/lib/ad-categories/contracts';

async function refresh(){await bustAdCaches();revalidatePath('/admin/categories');revalidatePath('/ads/new');revalidatePath('/ads/[id]','page');revalidatePath('/companies/[id]/p/[adId]','page');}
/** يعيد التوجيه إلى الصفحة/التبويب الذي جاء منه الحفظ (return_to) أو الصفحة الرئيسية. */
function back(fd:FormData,status:'saved'|'error',code='1'){const r=String(fd.get('return_to')||'');const base=/^\/admin\/categories(\?|$)/.test(r)?r:'/admin/categories';return `${base}${base.includes('?')?'&':'?'}${status}=${code}`;}
function nameAndOrder(fd:FormData){const name=String(fd.get('name')||'').trim(),order=Number(fd.get('order')||0);if(!name||name.length>200||!Number.isSafeInteger(order)||order<0||order>10000)throw new CategoryValidationError('','الاسم أو الترتيب غير صالح');return {name,order};}
export async function saveCategorySettings(fd:FormData){
  await requireAccess('categories', 'manage_settings');
  await setSetting('categories_v2_enabled',fd.get('enabled')==='1'?'1':'0');
  for(const [k,fallback] of Object.entries(CATEGORY_LABELS)) await setSetting(`categories_v2_label_${k}`,String(fd.get(`label_${k}`)||fallback).trim().slice(0,500));
  await refresh();redirect(back(fd,'saved'));
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
  }catch(e){if(e instanceof CategoryValidationError)redirect(back(fd,'error','input'));throw e;}
  await refresh();redirect(back(fd,'saved'));
}
export async function toggleCategory(fd:FormData){
  const actor=await requireAccess('categories','suspend');const id=categoryId(fd.get('id'));const sub=fd.get('sub')==='1';const active=fd.get('active')==='1';
  await prisma.$transaction(async tx=>{
    if(sub)await tx.sub_categories.update({where:{id:BigInt(id)},data:{active:active?1:0}});
    else await tx.categories.update({where:{id:BigInt(id)},data:{is_active:active?'yes':'no'}});
    await tx.$executeRaw`INSERT INTO ad_category_audit(actor_id,action,payload) VALUES (${actor.uid},'visibility',${JSON.stringify({id,sub,active})})`;
  });await refresh();redirect(back(fd,'saved'));
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
  }catch(e){if(e instanceof CategoryValidationError)redirect(back(fd,'error','input'));throw e;}
  await refresh();redirect(back(fd,'saved'));
}

/** Only flag changes; versions/membership are checked under the same locks. */
export async function saveSharedCategoryFields(fd:FormData){
  const actor=await requireAccess('categories','edit');
  try {
    const cid=categoryId(fd.get('category_id'));
    const versionText=String(fd.get('versions_json')||''),changeText=String(fd.get('changes_json')||'');
    if(versionText.length>100000||changeText.length>500000)throw new CategoryValidationError('','الطلب كبير جداً');
    let expected:{id:number;version:number}[],changes:FieldChange[];
    try{expected=JSON.parse(versionText);changes=JSON.parse(changeText);}catch{throw new CategoryValidationError('','طلب غير صالح');}
    if(!Array.isArray(expected)||expected.length>2000||expected.some(s=>!s||!Number.isSafeInteger(s.id)||s.id<=0||!Number.isSafeInteger(s.version)||s.version<0)
      ||new Set(expected.map(s=>s.id)).size!==expected.length)throw new CategoryValidationError('','نسخ الأقسام غير صالحة');
    await prisma.$transaction(async tx=>{
      const parent=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM categories WHERE id=${cid} FOR UPDATE`;
      if(!parent.length)throw new CategoryValidationError('','القسم غير موجود');
      const rows=await tx.$queryRaw<{id:bigint;name:string;version:number|null;fields_json:unknown}[]>`SELECT s.id,s.name,d.version,d.fields_json FROM sub_categories s LEFT JOIN ad_category_definitions d ON d.subcategory_id=s.id WHERE s.category_id=${cid} ORDER BY s.id FOR UPDATE`;
      if(rows.length!==expected.length||rows.some(r=>expected.find(s=>s.id===Number(r.id))?.version!==(r.version??0)))throw new CategoryValidationError('','تغيّرت الأقسام؛ أعد تحميل الصفحة');
      const subs:SubcategoryOption[]=rows.map(r=>({id:Number(r.id),name:r.name,categoryId:cid,version:r.version??0,active:true,order:0,kind:'other',priceEnabled:false,goodsEnabled:false,
        fields:r.version===null?[]:validateDefinition(typeof r.fields_json==='string'?JSON.parse(r.fields_json):r.fields_json)}));
      const updates=planCategoryFieldChanges(subs,changes);
      for(const sub of updates){
        const count=await tx.$executeRaw`UPDATE ad_category_definitions SET fields_json=${JSON.stringify(sub.fields)},version=version+1 WHERE subcategory_id=${sub.id} AND version=${sub.version}`;
        if(count!==1)throw new CategoryValidationError('','تغيّر التعريف');
      }
      if(updates.length)await tx.$executeRaw`INSERT INTO ad_category_audit(actor_id,action,payload) VALUES (${actor.uid},'shared_field_flags',${JSON.stringify({categoryId:cid,subcategories:updates.map(s=>s.id),changes})})`;
    });
  }catch(e){if(e instanceof CategoryValidationError)redirect(back(fd,'error','input'));throw e;}
  await refresh();redirect(back(fd,'saved'));
}
