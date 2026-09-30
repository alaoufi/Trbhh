import {requireAction} from '@/lib/roles';
import {prisma} from '@/lib/prisma';
import {getCategoryFormConfig} from '@/lib/ad-categories/service';
import {AdCategoryEditor} from '@/components/ad-category-editor';
import {saveCategory,saveCategorySettings,saveSubcategory,toggleCategory} from './actions';
import {getFallbackCategoryId} from '@/lib/data';
const input='rounded border p-2';
export default async function CategoriesPage({searchParams}:{searchParams:Promise<{error?:string;saved?:string;page?:string}>}){
  await requireAction('categories','view');
  const [cfg,q,usageRows]=await Promise.all([
    getCategoryFormConfig(true),searchParams,
    prisma.$queryRaw<{category_id:bigint;subcategory_id:number|null;ad_count:bigint}[]>`SELECT category_id,subcategory_id,COUNT(*) AS ad_count FROM ads GROUP BY category_id,subcategory_id`.catch(()=>[]),
  ]);
  const page=Math.max(1,Math.min(100000,Number(q.page)||1));
  const uncovered=cfg.subcategories.filter(item=>item.active&&item.version<1);
  const configured=cfg.subcategories.filter(item=>item.version>0);
  const categoryCounts=new Map<number,number>(),subcategoryCounts=new Map<number,number>();
  for(const row of usageRows){categoryCounts.set(Number(row.category_id),(categoryCounts.get(Number(row.category_id))||0)+Number(row.ad_count));if(row.subcategory_id!==null)subcategoryCounts.set(row.subcategory_id,(subcategoryCounts.get(row.subcategory_id)||0)+Number(row.ad_count));}
  const fallbackId=await getFallbackCategoryId().catch(()=>0);
  const otherIds=fallbackId?[BigInt(fallbackId)]:[];
  const unclassified=await prisma.ads.findMany({where:{OR:[{cat_reviewed:0},{subcategory_id:null},{category_id:{in:otherIds}}]},select:{id:true,title:true,category_id:true,subcategory_id:true},orderBy:{id:'desc'},take:50,skip:(Math.floor(page)-1)*50});
  return <div dir="rtl" className="space-y-5"><h1 className="text-xl font-bold">إدارة الأقسام والحقول</h1>
    {q.error==='read-only'?<p role="alert" className="rounded bg-amber-50 p-3 text-amber-900">هذه معاينة محمية: تعديل الأسماء والحقول غير متاح هنا، ويمكنك تجربة إخفاء الأقسام وإظهارها دون تعديل قاعدة الإنتاج.</p>:q.error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-800">لم يتم الحفظ. راجع البيانات أو أعد تحميل الصفحة إذا تغيّر التعريف.</p>}
    {q.saved==='preview'?<p role="status" className="rounded bg-emerald-50 p-3 text-emerald-900">تم تحديث الظهور في المعاينة فقط — قاعدة الإنتاج لم تتغير.</p>:q.saved&&<p role="status">تم الحفظ</p>}
    <section className={`rounded-xl border p-4 ${uncovered.length?'border-red-300 bg-red-50':'border-emerald-300 bg-emerald-50'}`}><h2 className="font-bold">تغطية تعريفات الأقسام</h2><p className="mt-1 text-sm">{configured.length} قسمًا فرعيًا له تعريف حقول صريح. {uncovered.length?`${uncovered.length} قسمًا نشطًا بلا تعريف مكتمل ولن يظهر في نموذج الإعلان العام حتى يُضبط:`:'كل الأقسام الفرعية النشطة مغطاة ولا يستخدم أي منها نموذجًا عامًا بالصدفة.'}</p>{uncovered.length>0&&<ul className="mt-2 list-inside list-disc text-sm">{uncovered.map(item=><li key={item.id}>{cfg.categories.find(category=>category.id===item.categoryId)?.name} — {item.name} (#{item.id})</li>)}</ul>}</section>
    <form action={saveCategorySettings} className="space-y-3 rounded-xl border p-4"><label><input type="checkbox" name="enabled" value="1" defaultChecked={cfg.enabled}/> تفعيل الأقسام في الإعلانات الفعلية</label><label className="block"><input type="checkbox" name="latest_templates" value="1" defaultChecked={cfg.useLatestTemplates!==false}/> استخدام أحدث القوالب الدقيقة للتعريفات النظامية القديمة غير المعدلة <span className="block text-xs text-muted-foreground">لا يغيّر أي قسم عدّلته الإدارة، ويمكن إيقافه من هنا.</span></label><div className="grid gap-2 sm:grid-cols-2">{Object.entries(cfg.labels).map(([k,v])=><label key={k}>{k}<input className={`${input} w-full`} name={`label_${k}`} defaultValue={v} maxLength={500}/></label>)}</div><button className={input}>حفظ الإعدادات والنصوص</button></form>
    <form action={saveCategory} className="flex flex-wrap gap-2"><input className={input} name="name" placeholder="اسم قسم جديد" aria-label="اسم قسم جديد" required/><input className={input} name="order" type="number" min={0} max={10000} defaultValue={0} aria-label="ترتيب القسم"/><button className={input}>إضافة قسم مخفي</button></form>
    {cfg.categories.map(c=><details key={c.id} className="space-y-3 rounded-xl border p-4"><summary className="cursor-pointer font-bold">{c.name} — {c.active?'ظاهر':'مخفي'} — {categoryCounts.get(c.id)||0} إعلان (#{c.id})</summary>
      <form action={saveCategory} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="id" value={c.id}/><input className={input} name="name" aria-label="اسم القسم" required defaultValue={c.name}/><input className={input} name="order" type="number" min={0} max={10000} defaultValue={c.order} aria-label="الترتيب"/><button className={input}>حفظ القسم</button></form>
      <form action={toggleCategory}><input type="hidden" name="id" value={c.id}/><input type="hidden" name="active" value={c.active?'0':'1'}/><button className={input}>{c.active?'إخفاء القسم':'إظهار القسم'}</button></form>
      {cfg.subcategories.filter(s=>s.categoryId===c.id).map(s=><details key={s.id} className="rounded border p-3"><summary>{s.name} — {s.active?'ظاهر':'مخفي'} — {subcategoryCounts.get(s.id)||0} إعلان — نسخة {s.version}{s.templateKey?` — قالب ${s.templateKey}`:' — تعريف إداري'}</summary><AdCategoryEditor initial={s} categoryId={c.id} action={saveSubcategory}/><form action={toggleCategory}><input type="hidden" name="sub" value="1"/><input type="hidden" name="id" value={s.id}/><input type="hidden" name="active" value={s.active?'0':'1'}/><button className={input}>{s.active?'إخفاء القسم الفرعي':'إظهار القسم الفرعي'}</button></form></details>)}
      <details><summary>إضافة قسم فرعي مخفي</summary><AdCategoryEditor categoryId={c.id} action={saveSubcategory}/></details>
    </details>)}
    <section className="space-y-3"><h2 className="font-bold">إعلانات غير مصنفة أو بانتظار المراجعة</h2><p className="text-sm">عرض فقط؛ لا إسناد تلقائي ولا تغيير للعناوين أو الصور.</p><table className="w-full text-sm"><thead><tr><th>الرقم</th><th>العنوان</th><th>القسم الحالي</th></tr></thead><tbody>{unclassified.map(a=><tr key={String(a.id)}><td>{String(a.id)}</td><td><a href={`/ads/${a.id}`}>{a.title}</a></td><td>{cfg.categories.find(c=>c.id===Number(a.category_id))?.name||String(a.category_id)}</td></tr>)}</tbody></table><div className="flex gap-4">{page>1&&<a href={`?page=${page-1}`}>السابق</a>}{unclassified.length===50&&<a href={`?page=${page+1}`}>التالي</a>}</div></section>
  </div>;
}
