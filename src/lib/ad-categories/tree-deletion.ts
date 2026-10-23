import type {Prisma} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {CategoryValidationError} from './validation';
type Tx=Prisma.TransactionClient;
const fail=(message:string):never=>{throw new CategoryValidationError('',message);};
const identifier=(value:string)=>{if(!/^[a-zA-Z0-9_]+$/.test(value))fail('تعذر التحقق من الارتباطات');return '`'+value+'`';};
/** Discover named and declared-FK references; unrecognized references block deletion. */
async function references(tx:Tx,target:'categories'|'sub_categories'|'ads'){
 const names=target==='categories'?['category_id']:target==='sub_categories'?['subcategory_id']:['ad_id','ads_id','advertisement_id'];
 const columns=await tx.$queryRawUnsafe<{t:string;c:string;e:string}[]>(`SELECT DISTINCT c.TABLE_NAME AS t,c.COLUMN_NAME AS c,t.ENGINE AS e FROM information_schema.COLUMNS c JOIN information_schema.TABLES t ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME WHERE c.TABLE_SCHEMA=DATABASE() AND t.TABLE_TYPE='BASE TABLE' AND (c.COLUMN_NAME IN (${names.map(()=>'?').join(',')}) OR EXISTS (SELECT 1 FROM information_schema.KEY_COLUMN_USAGE k WHERE k.TABLE_SCHEMA=c.TABLE_SCHEMA AND k.TABLE_NAME=c.TABLE_NAME AND k.COLUMN_NAME=c.COLUMN_NAME AND k.REFERENCED_TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME=?))`,...names,target);
 if(!columns.length)fail('تعذر فحص ارتباطات قاعدة البيانات');
 return columns;
}
const adLocal=new Map([['ad_category_values','ad_id'],['ads_views','ads_id'],['classified_views','ad_id'],['favorites','ads_id'],['ad_contacts','ad_id'],['ad_media','ad_id'],['ad_show_reminders','ad_id'],['photos','other_id']]);
async function assertUnused(tx:Tx,target:'categories'|'sub_categories'|'ads',id:bigint){
 for(const ref of await references(tx,target)){
  if(ref.e!=='InnoDB')fail('تعذر التحقق الآمن من جميع الارتباطات');
  if(target==='sub_categories'&&ref.t==='ad_category_definitions'&&ref.c==='subcategory_id')continue;
  if(target==='ads'&&adLocal.get(ref.t)===ref.c)continue;
  const found=await tx.$queryRawUnsafe(`SELECT ${identifier(ref.c)} FROM ${identifier(ref.t)} WHERE ${identifier(ref.c)}=? LIMIT 1 FOR UPDATE`,id) as unknown[];
  if(found.length)fail(target==='ads'?'للإعلان سجلات مرتبطة تمنع حذفه نهائياً. يمكن إبقاؤه مؤرشفاً.':'توجد إعلانات أو ارتباطات أخرى تمنع حذف هذا القسم.');
 }
}
export async function deleteEmptyCategoryNode(actor:number,id:number,parentId:number|null){
 return prisma.$transaction(async tx=>{
  const parent=parentId??id;
  const roots=await tx.$queryRaw`SELECT id,name,is_active,ordered FROM categories WHERE id=${parent} FOR UPDATE` as unknown[];
  if(!roots.length)fail('القسم الرئيسي غير موجود');
  const children=await tx.$queryRaw<{id:bigint;name:string}[]>`SELECT id,name FROM sub_categories WHERE category_id=${parent} ORDER BY id FOR UPDATE`;
  if(parentId===null){
   if(children.length)fail('احذف جميع الفروع أولاً، ثم احذف القسم الرئيسي.');
   await assertUnused(tx,'categories',BigInt(id));
   await tx.$executeRaw`INSERT INTO ad_category_audit(actor_id,action,payload) VALUES (${actor},'delete_empty_category',${JSON.stringify({id,parentId,before:roots},(_,v)=>typeof v==='bigint'?String(v):v)})`;
   await tx.$executeRaw`DELETE FROM categories WHERE id=${id}`;
  }else{
   const sub=children.find(s=>Number(s.id)===id);if(!sub)fail('الفرع غير تابع للقسم المحدد');
   const ads=await tx.$queryRaw`SELECT id FROM ads WHERE subcategory_id=${id} LIMIT 1 FOR UPDATE` as unknown[];
   if(ads.length)fail('احذف جميع إعلانات الفرع أولاً، بما فيها المؤرشفة والمخفية.');
   await assertUnused(tx,'sub_categories',BigInt(id));
   // Orphan category values are only removable after checking their ad rows too.
   const linked=await tx.$queryRaw`SELECT a.id FROM ad_category_values v JOIN ads a ON a.id=v.ad_id WHERE v.subcategory_id=${id} LIMIT 1 FOR UPDATE` as unknown[];
   if(linked.length)fail('توجد بيانات إعلانات مرتبطة بهذا الفرع.');
   const defs=await tx.$queryRaw`SELECT * FROM ad_category_definitions WHERE subcategory_id=${id} FOR UPDATE`;
   await tx.$executeRaw`INSERT INTO ad_category_audit(actor_id,action,payload) VALUES (${actor},'delete_empty_subcategory',${JSON.stringify({id,parentId,before:sub,definitions:defs},(_,v)=>typeof v==='bigint'?String(v):v)})`;
   await tx.$executeRaw`DELETE FROM ad_category_values WHERE subcategory_id=${id}`;
   await tx.$executeRaw`DELETE FROM ad_category_definitions WHERE subcategory_id=${id}`;
   await tx.$executeRaw`DELETE FROM sub_categories WHERE id=${id} AND category_id=${parentId}`;
  }
 },{isolationLevel:'Serializable',timeout:15000});
}
export async function deleteTreeAd(actor:number,id:bigint,mode:'archive'|'delete'){
 return prisma.$transaction(async tx=>{
  const rows=await tx.$queryRaw<{id:bigint;title:string;data_archive:string|null}[]>`SELECT id,title,data_archive FROM ads WHERE id=${id} FOR UPDATE`;
  const ad=rows[0];if(!ad)fail('الإعلان غير موجود');
  if(mode==='archive'){
   if(ad.data_archive?.trim())return {archived:true,deleted:false};
   await tx.$executeRaw`UPDATE ads SET status=0,data_archive=${new Date().toISOString()} WHERE id=${id}`;
   await tx.$executeRaw`INSERT INTO ad_category_audit(actor_id,action,payload) VALUES (${actor},'archive_tree_ad',${JSON.stringify({id:String(id)})})`;
   return {archived:true,deleted:false};
  }
  if(!ad.data_archive?.trim())fail('أرشف الإعلان أولاً قبل حذفه نهائياً.');
  const engines=await tx.$queryRawUnsafe<{t:string;e:string}[]>("SELECT TABLE_NAME AS t,ENGINE AS e FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ("+[...adLocal].map(()=>'?').join(',')+")",...[...adLocal.keys()]);
  if(engines.length!==adLocal.size||engines.some(t=>t.e!=='InnoDB'))fail('تعذر التحقق الآمن من جداول الإعلان');
  await assertUnused(tx,'ads',id);
  // Keep financial, commerce, moderation and conversation records; their presence blocks deletion.
  for(const [table,column] of adLocal)await tx.$executeRawUnsafe(`DELETE FROM ${identifier(table)} WHERE ${identifier(column)}=?`,id);

  await tx.$executeRaw`DELETE FROM ads WHERE id=${id}`;
  await tx.$executeRaw`INSERT INTO ad_category_audit(actor_id,action,payload) VALUES (${actor},'delete_tree_ad',${JSON.stringify({id:String(id),title:ad.title})})`;
  return {archived:true,deleted:true};
 },{isolationLevel:'Serializable',timeout:15000});
}
