import type {Prisma} from '@prisma/client';
import {CategoryValidationError} from './validation';
/** Hold the category row through the write, so a merge cannot leave a stale ID behind. */
export async function lockCategoryReference(tx:Prisma.TransactionClient,id:bigint,subcategoryId?:number|null){
 const roots=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM categories WHERE id=${id} FOR SHARE`;
 if(!roots.length)throw new CategoryValidationError('','تغيّر القسم أو تم دمجه؛ حدّث القائمة واختر القسم المعتمد.');
 if(subcategoryId){const subs=await tx.$queryRaw`SELECT id FROM sub_categories WHERE id=${subcategoryId} AND category_id=${id} FOR SHARE` as unknown[];if(!subs.length)throw new CategoryValidationError('','تغيّر الفرع أو القسم؛ حدّث القائمة.');}
}
