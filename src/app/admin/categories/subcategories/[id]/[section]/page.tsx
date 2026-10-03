import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireAction} from '@/lib/roles';
import {getCategoryFormConfig} from '@/lib/ad-categories/service';
import {CATEGORY_EDITOR_SECTIONS,categoryEditorPath,isCategoryEditorSection} from '@/lib/ad-categories/admin-presentation';
import {AdCategoryEditor} from '@/components/ad-category-editor';
import {saveSubcategory} from '../../../actions';

export default async function CategoryFieldsPage({params,searchParams}:{params:Promise<{id:string;section:string}>;searchParams:Promise<{error?:string;saved?:string}>}){
  await requireAction('categories','view');
  const [{id,section},q]=await Promise.all([params,searchParams]);
  if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id))||!isCategoryEditorSection(section))notFound();
  const cfg=await getCategoryFormConfig(true);
  const sub=cfg.subcategories.find(item=>item.id===Number(id));
  if(!sub)notFound();
  const category=cfg.categories.find(item=>item.id===sub.categoryId);
  return <div dir="rtl" className="space-y-4">
    <Link className="inline-block underline" href="/admin/categories">العودة إلى إدارة الأقسام</Link>
    <h1 className="text-xl font-bold">{CATEGORY_EDITOR_SECTIONS[section]} — {sub.name}</h1>
    <p className="text-sm text-muted-foreground">{category?.name} / {sub.name} · احفظ التعديلات قبل الانتقال إلى صفحة أخرى.</p>
    <nav aria-label="إدارة حقول القسم" className="flex flex-wrap gap-2">{Object.entries(CATEGORY_EDITOR_SECTIONS).map(([key,label])=>isCategoryEditorSection(key)&&<Link key={key} href={categoryEditorPath(sub.id,key)} aria-current={section===key?'page':undefined} className={`rounded-lg border px-3 py-2 text-sm ${section===key?'bg-primary text-white':'bg-white'}`}>{label}</Link>)}</nav>
    {q.error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{q.error==='read-only'?'هذه معاينة محمية؛ تعديل الحقول غير متاح على بيانات الإنتاج.':'لم يتم الحفظ. راجع الحقول أو أعد تحميل الصفحة إذا عدّلها مسؤول آخر.'}</p>}
    {q.saved&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">تم حفظ إعدادات هذا القسم.</p>}
    {section==='requirements'&&<p className="rounded-lg bg-slate-50 p-3 text-sm">إجباري: يجب على العضو تعبئة الحقل عند ظهوره. اختياري: يمكنه تركه فارغًا. الحقل المخفي لا يمنع نشر الإعلان، وشروط الإلزام تظهر بوضوح إذا كانت موجودة.</p>}
    {section==='display'&&<p className="rounded-lg bg-slate-50 p-3 text-sm">هذه إعدادات استخدام الحقل في الصفحات؛ لا تغيّر كونه إجباريًا أو اختياريًا. العرض العام يظل خاضعًا لقواعد الظهور والخصوصية القائمة.</p>}
    <AdCategoryEditor key={`${sub.id}:${sub.version}:${section}`} initial={sub} categoryId={sub.categoryId} section={section} action={saveSubcategory}/>
  </div>;
}
