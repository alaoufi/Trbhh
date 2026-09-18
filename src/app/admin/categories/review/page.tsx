import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAction } from '@/lib/roles';
import { categoryOptions } from '@/lib/categories-v2';
import { prepareClassification,applyClassification,rollbackClassification } from '../actions';
import { ClassificationTable } from '@/components/classification-table';
import { mediaUrl } from '@/lib/media';
export default async function ReviewPage({searchParams}:{searchParams:Promise<{batch?:string}>}){
  await requireAction('categories','view');
  const [sp,cats,batches]=await Promise.all([searchParams,categoryOptions(),prisma.category_migration_batches.findMany({orderBy:{id:'desc'},take:20})]);
  const selected=batches.find(b=>String(b.id)===sp.batch)||batches[0];
  const suggestions=selected?await prisma.category_migration_suggestions.findMany({where:{batch_id:selected.id},orderBy:{id:'asc'},take:100}):[];
  const ads=await prisma.ads.findMany({where:{id:{in:suggestions.map(s=>s.ad_id)}},select:{id:true,title:true}});
  const photos=await prisma.photos.findMany({where:{other_id:{in:ads.map(a=>a.id)}},orderBy:{id:'asc'},select:{other_id:true,photo_path:true}});
  const uploadIds=[...new Set(photos.map(p=>BigInt(Number(p.photo_path)||0)).filter(id=>id>0n))];
  const uploads=uploadIds.length?await prisma.uploads.findMany({where:{id:{in:uploadIds}},select:{id:true,file_name:true}}):[];
  const files=new Map(uploads.map(u=>[String(u.id),mediaUrl(u.file_name)]));
  const imageByAd=new Map<string,string>();
  for (const photo of photos) { const url=files.get(String(BigInt(Number(photo.photo_path)||0))); if (url && !imageByAd.has(String(photo.other_id))) imageByAd.set(String(photo.other_id),url); }
  const last=suggestions.reduce((max,r)=>r.ad_id>max?r.ad_id:max,0n);
  return <div className="space-y-5"><h1 className="text-2xl font-bold">التصنيف والمراجعة الجماعية</h1><p className="text-sm text-slate-600">التحليل محلي؛ النسبة مؤشر تقريبي وليست ضماناً. كل دفعة تصل إلى 100 إعلان، ثم تختار القسم والفرع وتطبق التحويل جماعياً.</p><div className="flex flex-wrap gap-3"><form action={prepareClassification} className="flex flex-wrap items-center gap-3 rounded-xl border p-4"><label>ابدأ بعد رقم الإعلان <input className="w-28 rounded border p-2" name="after" type="number" min="0" defaultValue="0"/></label><input type="hidden" name="legacyOnly" value="1"/><label><input name="auto" type="checkbox"/> اعتمد المطابقات الواضحة تلقائياً</label><button className="rounded-xl bg-primary px-4 py-2 text-white">معالجة الإعلانات القديمة غير المصنفة</button></form><form action={prepareClassification} className="flex items-center gap-2 rounded-xl border p-4"><input name="after" type="hidden" value="0"/><button className="rounded-xl border border-primary px-4 py-2 text-primary">تحليل كل الإعلانات من البداية</button></form></div><nav className="flex flex-wrap gap-2">{batches.map(b=><Link key={String(b.id)} className="rounded-full border px-3 py-2 text-sm" href={`?batch=${b.id}`}>دفعة {String(b.id)} · {b.applied_count}/{b.total_count}</Link>)}</nav>{selected&&<><ClassificationTable batch={String(selected.id)} categories={cats} action={applyClassification} rows={suggestions.map(r=>({id:String(r.id),adId:String(r.ad_id),title:ads.find(a=>a.id===r.ad_id)?.title||'إعلان محذوف',image:imageByAd.get(String(r.ad_id))||null,category:cats.find(c=>c.id===Number(r.category_id))?.name||'أخرى',confidence:r.confidence,status:r.status,matched:r.matched||''}))}/><form action={rollbackClassification}><input name="batch" type="hidden" value={String(selected.id)}/><button className="rounded-xl border border-amber-500 px-4 py-2 text-amber-800">التراجع عن التحويلات التي لم تتغير في هذه الدفعة</button></form></>}</div>;
}
