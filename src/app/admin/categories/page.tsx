import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccessBoundary } from '@/components/access-boundary';
import { requireAdminPage, readActorAccess } from '@/lib/access-control/guards';
import { prisma } from '@/lib/prisma';
import { getCategoryFormConfig } from '@/lib/ad-categories/service';
import { AdCategoryEditor } from '@/components/ad-category-editor';
import { CategoryAdminNavigation } from '@/components/category-admin-navigation';
import { CategoryFieldPicker } from '@/components/category-field-picker';
import {
  CATEGORY_ADMIN_PAGES, CATEGORY_EDITOR_SECTIONS,
  isCategoryAdminView, isCategoryEditorSection, categoryAdminQuery, categoryEditorPath,
  type CategoryAdminQuery,
} from '@/lib/ad-categories/admin-navigation';
import { saveCategory, saveCategorySettings, saveSubcategory, toggleCategory, fillEmptyCategoryFields } from './actions';

const input = 'min-h-11 w-full min-w-0 rounded-lg border p-2 text-sm';
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 text-sm font-bold';
const labelNames: Record<string, string> = { section: 'عنوان مجموعة التصنيف', category: 'اسم خانة القسم', subcategory: 'اسم خانة القسم الفرعي', choose: 'عبارة الاختيار', error: 'رسالة خطأ التصنيف', details: 'عنوان مواصفات الإعلان', preserve: 'خيار إبقاء التصنيف', reclassify: 'خيار تغيير التصنيف', preserveHint: 'شرح إبقاء التصنيف', browse: 'زر عرض الإعلانات', clear: 'زر مسح التصفية', resultsTitle: 'عنوان نتائج القسم', emptyText: 'رسالة عدم وجود إعلانات' };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<CategoryAdminQuery> }) {
  const session = await requireAdminPage('/admin/categories');
  const { keys } = await readActorAccess(session.uid);
  const q = await searchParams;
  const cfg = await getCategoryFormConfig(true);
  const filter = categoryAdminQuery(q);
  if (filter.invalid) notFound();

  const notice = (
    <>
      {q.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{q.error === 'input' ? 'لم يتم الحفظ. راجع المدخلات أو أعد تحميل الصفحة إن تغيّر التعريف.' : 'تعذّر إتمام العملية.'}</p>}
      {q.saved && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{q.filled !== undefined ? `تم ✓ — عُبّئت حقول ${q.filled} قسماً فرعياً من القوالب المطابقة.` : 'تم الحفظ ✓'}</p>}
    </>
  );

  // ===== محرّر قسم فرعي مركّز (?sub=&section=) =====
  if (q.sub && /^[1-9]\d*$/.test(q.sub)) {
    const sid = Number(q.sub);
    const sub = cfg.subcategories.find((s) => s.id === sid);
    if (!sub) notFound();
    const section = isCategoryEditorSection(q.section) ? q.section : 'fields';
    const category = cfg.categories.find((c) => c.id === sub.categoryId);
    const here = categoryEditorPath(sid, section);
    return (
      <div dir="rtl" className="min-w-0 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Link className={button} href="/admin/categories">▸ الأقسام وحقولها</Link>
          <Link className={button} href="/admin/categories?view=fields">اختيار قسم آخر</Link>
        </div>
        <h1 className="text-xl font-bold">{CATEGORY_EDITOR_SECTIONS[section]} — {sub.name}</h1>
        <p className="text-sm text-muted-foreground">{category?.name} / {sub.name} — احفظ قبل الانتقال لتبويب آخر.</p>
        <nav aria-label="تبويبات الحقول" className="flex flex-wrap gap-2">
          {(Object.entries(CATEGORY_EDITOR_SECTIONS) as [keyof typeof CATEGORY_EDITOR_SECTIONS, string][]).map(([k, label]) => (
            <Link key={k} href={categoryEditorPath(sid, k)} aria-current={section === k ? 'page' : undefined} className={`${button} ${section === k ? 'bg-primary text-white' : ''}`}>{label}</Link>
          ))}
        </nav>
        {section === 'requirements' && <p className="rounded-lg bg-slate-50 p-3 text-sm">إجباري: يجب على العضو تعبئته عند ظهوره. اختياري: يمكن تركه فارغاً. الحقل المخفي اختياري دائماً.</p>}
        {section === 'display' && <p className="rounded-lg bg-slate-50 p-3 text-sm">تحكّم بظهور كل حقل في نموذج الإعلان. إخفاء الحقل يجعله اختيارياً تلقائياً.</p>}
        {notice}
        <AccessBoundary module="categories" action="edit">
          <AdCategoryEditor key={`${sid}:${sub.version}:${section}`} initial={sub} categoryId={sub.categoryId} section={section} returnTo={here} action={saveSubcategory} />
        </AccessBoundary>
      </div>
    );
  }

  const view = isCategoryAdminView(q.view) ? q.view : undefined;

  // ===== الصفحة الرئيسية (بطاقات المهام) =====
  if (!view) {
    return (
      <div dir="rtl" className="min-w-0 space-y-4">
        <h1 className="text-xl font-bold">الأقسام وحقولها</h1>
        <p className="text-sm text-muted-foreground">اختر المهمة مباشرةً — كل مهمة في صفحتها المرتّبة:</p>
        {notice}
        <CategoryAdminNavigation home />
      </div>
    );
  }

  if (filter.category && !cfg.categories.some((c) => c.id === filter.category)) notFound();
  if (filter.subcategory && !cfg.subcategories.some((s) => s.id === filter.subcategory)) notFound();

  const ads = view === 'ads' && keys.has('ads:view')
    ? await prisma.ads.findMany({
        where: {
          ...(filter.category ? { category_id: BigInt(filter.category) } : {}),
          ...(filter.subcategory ? { subcategory_id: filter.subcategory } : {}),
          ...(q.review === '1' ? { OR: [{ cat_reviewed: 0 }, { subcategory_id: null }] } : {}),
        },
        select: { id: true, title: true, category_id: true, subcategory_id: true },
        orderBy: { id: 'desc' }, take: 51, skip: (filter.page - 1) * 50,
      })
    : [];
  const adsPage = (page: number) => {
    const p = new URLSearchParams({ view: 'ads', page: String(page) });
    if (filter.category) p.set('category', String(filter.category));
    if (filter.subcategory) p.set('subcategory', String(filter.subcategory));
    if (q.review === '1') p.set('review', '1');
    return `/admin/categories?${p}`;
  };

  return (
    <div dir="rtl" className="min-w-0 space-y-4">
      <h1 className="text-xl font-bold">{CATEGORY_ADMIN_PAGES[view].title}</h1>
      <CategoryAdminNavigation current={view} />
      {notice}

      {view === 'settings' && (
        <AccessBoundary module="categories" action="manage_settings">
          <form action={saveCategorySettings} className="space-y-3 rounded-xl border p-4">
            <input type="hidden" name="return_to" value="/admin/categories?view=settings" />
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="enabled" value="1" defaultChecked={cfg.enabled} /> تفعيل الأقسام في الإعلانات الفعلية</label>
            <div className="grid gap-2 sm:grid-cols-2">{Object.entries(cfg.labels).map(([k, v]) => <label key={k}>{labelNames[k] || k}<input className={input} name={`label_${k}`} defaultValue={v} maxLength={500} /></label>)}</div>
            <button className={`${button} bg-primary text-white`}>حفظ الإعدادات والنصوص</button>
          </form>
        </AccessBoundary>
      )}

      {view === 'manage' && (
        <>
          <AccessBoundary module="categories" action="edit">
            <form action={fillEmptyCategoryFields} className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-3">
              <p className="mb-2 text-sm font-bold text-emerald-900">تعبئة الحقول تلقائياً للأقسام الفرعية الفارغة</p>
              <p className="mb-3 text-xs text-emerald-900/80">يملأ حقول كل قسم فرعي لا تعريف له من القالب النظامي المطابق بالاسم (مثل «رافعات ومناولة»). آمن تماماً: لا يمسّ أي قسم عُرّفت حقوله فعلاً.</p>
              <button className={`${button} bg-emerald-600 text-white`}>🪄 عبّئ حقول الأقسام الفارغة الآن</button>
            </form>
          </AccessBoundary>
          <AccessBoundary module="categories" action="create">
            <form action={saveCategory} className="flex flex-wrap items-end gap-2 rounded-xl border p-3">
              <input type="hidden" name="return_to" value="/admin/categories?view=manage" />
              <label className="min-w-0 flex-1">اسم قسم رئيسي جديد<input className={input} name="name" placeholder="اسم القسم" required /></label>
              <label>الترتيب<input className={input} name="order" type="number" min={0} max={10000} defaultValue={0} /></label>
              <button className={`${button} bg-primary text-white`}>إضافة قسم مخفي</button>
            </form>
          </AccessBoundary>
          {cfg.categories.map((c) => (
            <details key={c.id} open={filter.category === c.id} className="space-y-3 rounded-xl border p-3">
              <summary className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-lg bg-secondary/60 px-3 py-2 font-bold hover:bg-secondary"><span>{c.name} — {c.active ? 'ظاهر' : 'مخفي'} (#{c.id})</span><span className="text-xs font-normal text-muted-foreground">اضغط ▾</span></summary>
              <AccessBoundary module="categories" action="edit">
                <form action={saveCategory} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="return_to" value="/admin/categories?view=manage" /><label className="min-w-0 flex-1">اسم القسم<input className={input} name="name" required defaultValue={c.name} /></label><label>الترتيب<input className={input} name="order" type="number" min={0} max={10000} defaultValue={c.order} /></label><button className={button}>حفظ القسم</button></form>
              </AccessBoundary>
              <AccessBoundary module="categories" action="suspend">
                <form action={toggleCategory}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={c.active ? '0' : '1'} /><input type="hidden" name="return_to" value="/admin/categories?view=manage" /><button className={button}>{c.active ? 'إخفاء القسم' : 'إظهار القسم'}</button></form>
              </AccessBoundary>
              {cfg.subcategories.filter((s) => s.categoryId === c.id).map((s) => (
                <section key={s.id} className="space-y-2 rounded-lg border bg-slate-50 p-3">
                  <h3 className="break-words font-bold">{s.name} — {s.active ? 'ظاهر' : 'مخفي'} — نسخة {s.version}</h3>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Link className={`${button} bg-primary text-white`} href={categoryEditorPath(s.id, 'fields')}>✏️ تعديل الحقول</Link>
                    <Link className={button} href={`/admin/categories?view=ads&category=${c.id}&subcategory=${s.id}`}>إعلانات هذا القسم</Link>
                    <AccessBoundary module="categories" action="suspend"><form action={toggleCategory}><input type="hidden" name="sub" value="1" /><input type="hidden" name="id" value={s.id} /><input type="hidden" name="active" value={s.active ? '0' : '1'} /><input type="hidden" name="return_to" value="/admin/categories?view=manage" /><button className={`${button} w-full`}>{s.active ? 'إخفاء الفرعي' : 'إظهار الفرعي'}</button></form></AccessBoundary>
                  </div>
                </section>
              ))}
              {!cfg.subcategories.some((s) => s.categoryId === c.id) && <p className="text-sm">لا توجد أقسام فرعية بعد. أضِفها أدناه.</p>}
              <AccessBoundary module="categories" action="create">
                <details className="rounded-lg border p-2"><summary className="cursor-pointer px-2 py-2 text-sm font-bold">➕ إضافة قسم فرعي مخفي</summary><div className="pt-2"><AdCategoryEditor categoryId={c.id} returnTo="/admin/categories?view=manage" action={saveSubcategory} /></div></details>
              </AccessBoundary>
            </details>
          ))}
        </>
      )}

      {(view === 'fields' || view === 'requirements' || view === 'display') && (
        <CategoryFieldPicker key={`${view}:${filter.category}:${filter.subcategory}`} section={view} categories={cfg.categories.map(({ id, name }) => ({ id, name }))} subcategories={cfg.subcategories.map(({ id, name, categoryId }) => ({ id, name, categoryId }))} initialCategory={filter.category} initialSubcategory={filter.subcategory} />
      )}

      {view === 'ads' && (
        <section aria-label="قائمة إعلانات الأقسام" className="space-y-3">
          <p className="text-sm text-muted-foreground">عرض إداري فقط؛ لا يُغيّر التصنيف أو بيانات الإعلانات.</p>
          {ads.slice(0, 50).map((ad) => (
            <article key={String(ad.id)} className="min-w-0 space-y-2 rounded-xl border p-3">
              <h3 className="break-words font-bold">{ad.title || 'إعلان بلا عنوان'}</h3>
              <p className="break-words text-sm">#{String(ad.id)} · {cfg.categories.find((c) => c.id === Number(ad.category_id))?.name || 'قسم غير متاح'} · {cfg.subcategories.find((s) => s.id === ad.subcategory_id)?.name || 'بدون قسم فرعي'}</p>
              <Link className={button} href={`/ads/${ad.id}`}>فتح الإعلان</Link>
            </article>
          ))}
          {ads.length === 0 && <p>لا توجد إعلانات مطابقة لهذه التصفية.</p>}
          <nav aria-label="صفحات الإعلانات" className="flex flex-wrap gap-2">{filter.page > 1 && <Link className={button} href={adsPage(filter.page - 1)}>السابق</Link>}{ads.length > 50 && <Link className={button} href={adsPage(filter.page + 1)}>التالي</Link>}</nav>
        </section>
      )}
    </div>
  );
}
