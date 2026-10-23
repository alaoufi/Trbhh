import {createHash} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {categoryId} from './contracts';
import {CategoryValidationError} from './validation';
type Tx=Prisma.TransactionClient;
type Row=Record<string,unknown>;
const tables=['ads','sub_categories','cj_products','stores','category__users','member_interests'] as const;
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
const fail=(s:string):never=>{throw new CategoryValidationError('',s);};
const ident=(s:string)=>{if(!/^[a-zA-Z0-9_]+$/.test(s))fail('تعذر فحص الارتباطات');return '`'+s+'`';};
async function snapshot(tx:Tx,source:number,target:number){
 categoryId(source);categoryId(target);if(source===target)fail('اختر قسمين مختلفين');
 const roots=await tx.$queryRaw<Row[]>`SELECT id,name,is_active,ordered,photo_path FROM categories WHERE id IN (${source},${target}) ORDER BY id FOR UPDATE`;
 if(roots.length!==2||!roots.some(r=>Number(r.id)===source)||!roots.some(r=>Number(r.id)===target))fail('أحد القسمين غير موجود');
 const refs=await tx.$queryRawUnsafe<{t:string;c:string;e:string}[]>(`SELECT DISTINCT c.TABLE_NAME AS t,c.COLUMN_NAME AS c,t.ENGINE AS e FROM information_schema.COLUMNS c JOIN information_schema.TABLES t ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME WHERE c.TABLE_SCHEMA=DATABASE() AND t.TABLE_TYPE='BASE TABLE' AND (c.COLUMN_NAME='category_id' OR EXISTS (SELECT 1 FROM information_schema.KEY_COLUMN_USAGE k WHERE k.TABLE_SCHEMA=c.TABLE_SCHEMA AND k.TABLE_NAME=c.TABLE_NAME AND k.COLUMN_NAME=c.COLUMN_NAME AND k.REFERENCED_TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME='categories')) ORDER BY t,c`);
 if(tables.some(t=>!refs.some(r=>r.t===t&&r.c==='category_id')))fail('تعذر فحص جميع جداول الأقسام');
 const rows:Record<string,Row[]>={};
 for(const ref of refs){
  if(ref.e!=='InnoDB')fail('توجد جداول لا تدعم الدمج الآمن');
  if(!tables.includes(ref.t as typeof tables[number])||ref.c!=='category_id'){
   const used=await tx.$queryRawUnsafe(`SELECT ${ident(ref.c)} FROM ${ident(ref.t)} WHERE ${ident(ref.c)}=? LIMIT 1 FOR UPDATE`,source) as Row[];
   if(used.length)fail('توجد ارتباطات إضافية تحتاج مراجعة قبل الدمج');continue;
  }
  const key=ref.t==='member_interests'?'user_id':'id';
  rows[ref.t]=await tx.$queryRawUnsafe<Row[]>(`SELECT ${ident(key)},category_id FROM ${ident(ref.t)} WHERE category_id IN (?,?) ORDER BY category_id,${ident(key)} LIMIT 10001 FOR UPDATE`,source,target);
  if(rows[ref.t].length>10000)fail('هذا الدمج كبير ويحتاج إجراءً مخصصاً');
 }
 const counts=Object.fromEntries(tables.map(t=>[t,{source:rows[t].filter(r=>Number(r.category_id)===source).length,target:rows[t].filter(r=>Number(r.category_id)===target).length}]));
 const token=createHash('sha256').update(json({roots,rows,source,target,refs})).digest('hex');
 return {roots,rows,counts,token,refs};
}
const options={isolationLevel:'Serializable' as const,timeout:30000};
export async function previewCategoryMerge(source:number,target:number){
 return prisma.$transaction(async tx=>{const s=await snapshot(tx,source,target);return {source:{id:source,name:String(s.roots.find(r=>Number(r.id)===source)!.name)},target:{id:target,name:String(s.roots.find(r=>Number(r.id)===target)!.name)},counts:s.counts,token:s.token};},options);
}
export type CategoryMergePreview=Awaited<ReturnType<typeof previewCategoryMerge>>;
export async function mergeCategories(actor:number,source:number,target:number,token:string){
 return prisma.$transaction(async tx=>{
  const s=await snapshot(tx,source,target);
  if(!/^[a-f0-9]{64}$/.test(token)||s.token!==token)fail('تغيّرت بيانات القسمين؛ أعد المعاينة قبل الدمج.');
  await tx.$executeRaw`INSERT INTO ad_category_audit(actor_id,action,payload) VALUES (${actor},'merge_categories',${json({source,target,roots:s.roots,moved:Object.fromEntries(tables.map(t=>[t,s.rows[t].filter(r=>Number(r.category_id)===source)])),counts:s.counts,interestsBefore:s.rows.member_interests})})`;
  for(const table of tables){
   if(!s.counts[table].source)continue;
   if(table==='member_interests')await tx.$executeRaw`DELETE s FROM member_interests s JOIN member_interests t ON t.user_id=s.user_id AND t.category_id=${target} WHERE s.category_id=${source}`;
   await tx.$executeRawUnsafe(`UPDATE ${ident(table)} SET category_id=? WHERE category_id=?`,target,source);
  }
  // Never remove the source until every discovered direct reference has been rechecked.
  for(const ref of s.refs){const left=await tx.$queryRawUnsafe(`SELECT ${ident(ref.c)} FROM ${ident(ref.t)} WHERE ${ident(ref.c)}=? LIMIT 1 FOR UPDATE`,source) as Row[];if(left.length)fail('بقيت ارتباطات؛ أُلغي الدمج بالكامل.');}
  await tx.$executeRaw`DELETE FROM categories WHERE id=${source}`;
  return {targetId:target,counts:s.counts};
 },options);
}
