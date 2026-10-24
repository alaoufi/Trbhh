import 'server-only';
import {Prisma} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {categoryId} from './contracts';
import {CategoryValidationError} from './validation';
import {planCategoryOrder,validateOrderRequest,type CategoryOrderItem} from './ordering';
type Row={id:bigint;name:string;active:number|string;sort_order:number};
const project=(rows:Row[]):CategoryOrderItem[]=>rows.map(r=>({id:Number(r.id),name:r.name,active:r.active===1||r.active==='yes',order:r.sort_order})).sort((a,b)=>a.order-b.order||a.id-b.id);
export async function readCategoryOrder(parentId:number|null):Promise<CategoryOrderItem[]>{
 if(parentId!==null)categoryId(parentId);
 const rows=parentId===null?await prisma.$queryRaw<Row[]>`SELECT id,name,is_active AS active,ordered AS sort_order FROM categories ORDER BY ordered,id`:await prisma.$queryRaw<Row[]>`SELECT id,name,active,\`order\` AS sort_order FROM sub_categories WHERE category_id=${parentId} ORDER BY \`order\`,id`;
 return project(rows);
}
export async function persistCategoryOrder(actor:number,raw:unknown):Promise<CategoryOrderItem[]>{
 const request=validateOrderRequest(raw),parentId=request.parentId;
 return prisma.$transaction(async tx=>{
  if(parentId!==null){const parent=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM categories WHERE id=${parentId} FOR UPDATE`;if(!parent.length)throw new CategoryValidationError('','القسم غير موجود');}
  const rows=parentId===null?await tx.$queryRaw<Row[]>`SELECT id,name,is_active AS active,ordered AS sort_order FROM categories ORDER BY id FOR UPDATE`:await tx.$queryRaw<Row[]>`SELECT id,name,active,\`order\` AS sort_order FROM sub_categories WHERE category_id=${parentId} ORDER BY id FOR UPDATE`;
  const before=project(rows),next=planCategoryOrder(before,request),changed=next.filter(r=>before.find(old=>old.id===r.id)?.order!==r.order);
  for(const row of changed){const count=parentId===null?await tx.$executeRaw`UPDATE categories SET ordered=${row.order} WHERE id=${row.id}`:await tx.$executeRaw`UPDATE sub_categories SET \`order\`=${row.order} WHERE id=${row.id} AND category_id=${parentId}`;if(count!==1)throw new CategoryValidationError('','لم يُحفظ الترتيب كاملاً؛ أعد تحميل القائمة');}
  if(changed.length){const payload=JSON.stringify({parentId,before:before.map(({id,order})=>({id,order})),after:next.map(({id,order})=>({id,order}))});await tx.$executeRaw`INSERT INTO ad_category_audit(actor_id,action,payload) VALUES (${actor},'reorder_categories',${payload})`;}
  return next;
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
