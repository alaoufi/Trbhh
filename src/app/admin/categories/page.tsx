import { AccessBoundary } from '@/components/access-boundary';
import { requireAdminPage, readActorAccess } from '@/lib/access-control/guards';

import {prisma} from '@/lib/prisma';
import {getCategoryFormConfig} from '@/lib/ad-categories/service';
import {AdCategoryEditor} from '@/components/ad-category-editor';
import {saveCategory,saveCategorySettings,saveSubcategory,toggleCategory} from './actions';
const input='rounded border p-2';
export default async function CategoriesPage({searchParams}:{searchParams:Promise<{error?:string;saved?:string;page?:string}>}){
  const session=await requireAdminPage('/admin/categories');
  const {keys}=await readActorAccess(session.uid);
  const cfg=await getCategoryFormConfig(true),q=await searchParams;
  const page=Math.max(1,Math.min(100000,Number(q.page)||1));
  const otherIds=cfg.categories.filter(c=>c.name==='عروض أخرى').map(c=>BigInt(c.id));
  const unclassified=keys.has('ads:view')?await prisma.ads.findMany({where:{OR:[{cat_reviewed:0},{subcategory_id:null},{category_id:{in:otherIds}}]},select:{id:true,title:true,category_id:true,subcategory_id:true},orderBy:{id:'desc'},take:50,skip:(Math.floor(page)-1)*50}):[];
  return <div dir="rtl" className="space-y-5"><h1 className="text-xl font-bold">إدارة الأقسام والحقول</h1>
    {q.error&&<p role="alert" className="rounded bg-red-50 p-3 text-red-800">لم يتم الحفظ. راجع البيانات أو أعد تحميل الصفحة إذا تغيّر التعريف.</p>}{q.saved&&<p role="status">تم الحفظ</p>}
    <AccessBoundary module={'categories'} action={'manage_settings'}><form action={saveCategorySettings} className="space-y-3 rounded-xl border p-4"><label><input type="checkbox" name="enabled" value="1" defaultChecked={cfg.enabled}/> تفعيل الأقسام في الإعلانات الفعلية</label><div className="grid gap-2 sm:grid-cols-2">{Object.entries(cfg.labels).map(([k,v])=><label key={k}>{k}<input className={`${input} w-full`} name={`label_${k}`} defaultValue={v} maxLength={500}/></label>)}</div><button className={input}>حفظ الإعدادات والنصوص</button></form></AccessBoundary>
    <AccessBoundary module="categories" action="create"><form action={saveCategory} className="flex flex-wrap gap-2"><input className={input} name="name" placeholder="اسم قسم جديد" aria-label="اسم قسم جديد" required/><input className={input} name="order" type="number" min={0} max={10000} defaultValue={0} aria-label="ترتيب القسم"/><button className={input}>إضافة قسم مخفي</button></form></AccessBoundary>
    {cfg.categories.map(c=><details key={c.id} className="space-y-3 rounded-xl border p-4"><summary className="cursor-pointer font-bold">{c.name} — {c.active?'ظاهر':'مخفي'} (#{c.id})</summary>
      <AccessBoundary module="categories" action="edit"><form action={saveCategory} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="id" value={c.id}/><input className={input} name="name" aria-label="اسم القسم" required defaultValue={c.name}/><input className={input} name="order" type="number" min={0} max={10000} defaultValue={c.order} aria-label="الترتيب"/><button className={input}>حفظ القسم</button></form></AccessBoundary>
      <AccessBoundary module={'categories'} action={'suspend'}><form action={toggleCategory}><input type="hidden" name="id" value={c.id}/><input type="hidden" name="active" value={c.active?'0':'1'}/><button className={input}>{c.active?'إخفاء القسم':'إظهار القسم'}</button></form></AccessBoundary>
      {cfg.subcategories.filter(s=>s.categoryId===c.id).map(s=><details key={s.id} className="rounded border p-3"><summary>{s.name} — {s.active?'ظاهر':'مخفي'} — نسخة {s.version}</summary><AccessBoundary module="categories" action="edit"><AdCategoryEditor initial={s} categoryId={c.id} action={saveSubcategory}/></AccessBoundary><AccessBoundary module={'categories'} action={'suspend'}><form action={toggleCategory}><input type="hidden" name="sub" value="1"/><input type="hidden" name="id" value={s.id}/><input type="hidden" name="active" value={s.active?'0':'1'}/><button className={input}>{s.active?'إخفاء القسم الفرعي':'إظهار القسم الفرعي'}</button></form></AccessBoundary></details>)}
      <details><summary>إضافة قسم فرعي مخفي</summary><AccessBoundary module="categories" action="create"><AdCategoryEditor categoryId={c.id} action={saveSubcategory}/></AccessBoundary></details>
    </details>)}
    <section className="space-y-3"><h2 className="font-bold">إعلانات غير مصنفة أو بانتظار المراجعة</h2><p className="text-sm">عرض فقط؛ لا إسناد تلقائي ولا تغيير للعناوين أو الصور.</p><table className="w-full text-sm"><thead><tr><th>الرقم</th><th>العنوان</th><th>القسم الحالي</th></tr></thead><tbody>{unclassified.map(a=><tr key={String(a.id)}><td>{String(a.id)}</td><td><a href={`/ads/${a.id}`}>{a.title}</a></td><td>{cfg.categories.find(c=>c.id===Number(a.category_id))?.name||String(a.category_id)}</td></tr>)}</tbody></table><div className="flex gap-4">{page>1&&<a href={`?page=${page-1}`}>السابق</a>}{unclassified.length===50&&<a href={`?page=${page+1}`}>التالي</a>}</div></section>
  </div>;
}
