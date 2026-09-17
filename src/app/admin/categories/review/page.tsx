import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAction } from '@/lib/roles';
import { categoryOptions } from '@/lib/categories-v2';
import { prepareClassification,applyClassification,rollbackClassification } from '../actions';
import { ClassificationTable } from '@/components/classification-table';
export default async function ReviewPage({searchParams}:{searchParams:Promise<{batch?:string}>}){
  await requireAction('categories','view');
  const [sp,cats,batches]=await Promise.all([searchParams,categoryOptions(),prisma.category_migration_batches.findMany({orderBy:{id:'desc'},take:20})]);
  const selected=batches.find(b=>String(b.id)===sp.batch)||batches[0];
  const suggestions=selected?await prisma.category_migration_suggestions.findMany({where:{batch_id:selected.id},orderBy:{id:'asc'},take:100}):[];
  const ads=await prisma.ads.findMany({where:{id:{in:suggestions.map(s=>s.ad_id)}},select:{id:true,title:true}});
  const last=suggestions.reduce((max,r)=>r.ad_id>max?r.ad_id:max,0n);
  return <div className="space-y-5"><h1 className="text-2xl font-bold">التصنيف والمراجعة الجماعية</h1><p className="text-sm text-slate-600">التحليل محلي؛ النسبة مؤشر تقريبي وليست ضماناً. يبدأ كل تحليل بدفعة تصل إلى 100 إعلان. غير المعروف يقترح له «أخرى».</p><form action={prepareClassification} className="flex flex-wrap items-center gap-3 rounded-xl border p-4"><label>ابدأ بعد رقم الإعلان <input className="w-28 rounded border p-2" name="after" type="number" min="0" defaultValue={String(last)}/></label><label><input name="auto" type="checkbox"/> اعتمد تلقائياً ما بلغ 85٪ فأعلى</label><button className="rounded-xl bg-primary px-4 py-2 text-white">تحليل الدفعة</button></form><nav className="flex flex-wrap gap-2">{batches.map(b=><Link key={String(b.id)} className="rounded-full border px-3 py-2 text-sm" href={`?batch=${b.id}`}>دفعة {String(b.id)} · {b.applied_count}/{b.total_count}</Link>)}</nav>{selected&&<><ClassificationTable batch={String(selected.id)} categories={cats} action={applyClassification} rows={suggestions.map(r=>({id:String(r.id),adId:String(r.ad_id),title:ads.find(a=>a.id===r.ad_id)?.title||'إعلان محذوف',category:cats.find(c=>c.id===Number(r.category_id))?.name||'أخرى',confidence:r.confidence,status:r.status,matched:r.matched||''}))}/><form action={rollbackClassification}><input name="batch" type="hidden" value={String(selected.id)}/><button className="rounded-xl border border-amber-500 px-4 py-2 text-amber-800">التراجع عن التحويلات التي لم تتغير في هذه الدفعة</button></form></>}</div>;
}
