import { CjAdminNav } from '@/components/cj/admin-nav';
import { requireAccess, hasAccess } from '@/lib/access-control/guards';
import { getSession } from '@/lib/auth';
import { listGlossary } from '@/lib/cj/glossary';
import { addCjGlossaryTerm, removeCjGlossaryTerm } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مُسرد ترجمة CJ', robots: { index: false, follow: false } };

const card = 'card-3d rounded-xl p-4 space-y-3';
const btn = 'rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white';
const input = 'mt-1 min-h-10 w-full rounded-lg border border-primary/25 bg-white px-3 text-sm';

export default async function CjGlossaryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccess('products', 'view');
  const sp = await searchParams;
  const session = await getSession();
  const canEdit = session ? await hasAccess(session.uid, 'products', 'edit') : false;
  const terms = await listGlossary();

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <CjAdminNav current="glossary" />
      <h1 className="text-xl font-extrabold text-primary">مُسرد الترجمة (محلي)</h1>
      <p className="text-sm text-muted-foreground">
        مصطلحات ثابتة (إنجليزي → عربي) تُطبَّق محلياً قبل الترجمة الآلية بلا إنترنت: مطابقة
        تامّة للحقول القصيرة (ألوان/مقاسات/أسماء الخيارات)، واستبدال المصطلح داخل العنوان
        والوصف. أي تعديل هنا يُطبَّق على كل ترجمات CJ الجديدة تلقائياً. تُبذَر مصطلحات شائعة
        تلقائياً ويمكن تعديلها أو حذفها.
      </p>
      {sp.saved && <p className="rounded-lg bg-green-50 p-2 text-sm text-green-700">تم الحفظ.</p>}
      {sp.deleted && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-700">تم الحذف.</p>}
      {sp.error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">تعذّر الحفظ — تأكّد من تعبئة المصدر والعربية.</p>}

      {canEdit && (
        <form action={addCjGlossaryTerm} className={card}>
          <div className="text-sm font-bold text-primary">إضافة / تعديل مصطلح</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">المصدر (إنجليزي)
              <input name="source" required maxLength={400} className={input} placeholder="Stainless Steel" dir="ltr" />
            </label>
            <label className="text-sm">العربية
              <input name="targetAr" required maxLength={400} className={input} placeholder="ستانلس ستيل" dir="rtl" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="wholeText" value="1" className="h-4 w-4" />
            مطابقة تامّة فقط (لا يُستبدل داخل الجُمل — مناسب للمختصرات والأحرف القصيرة)
          </label>
          <button type="submit" className={btn}>حفظ المصطلح</button>
          <p className="text-xs text-muted-foreground">تعديل مصطلح موجود: اكتب المصدر نفسه بعربية جديدة واحفظ.</p>
        </form>
      )}

      <div className={card}>
        <div className="text-sm font-bold text-primary">المصطلحات المحفوظة: <span className="text-foreground">{terms.length}</span></div>
        {!terms.length ? (
          <p className="text-sm text-muted-foreground">لا مصطلحات بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-xs text-muted-foreground">
                  <th className="p-2">المصدر</th><th className="p-2">العربية</th><th className="p-2">النوع</th>{canEdit && <th className="p-2"></th>}
                </tr>
              </thead>
              <tbody>
                {terms.map((t) => (
                  <tr key={t.id} className="border-t border-primary/10">
                    <td className="p-2" dir="ltr">{t.source}</td>
                    <td className="p-2" dir="rtl">{t.target_ar}</td>
                    <td className="p-2 text-xs text-muted-foreground">{t.whole_text ? 'مطابقة تامّة' : 'استبدال داخل النص'}{t.enabled ? '' : ' · معطّل'}</td>
                    {canEdit && (
                      <td className="p-2 text-left">
                        <form action={removeCjGlossaryTerm}>
                          <input type="hidden" name="id" value={t.id} />
                          <button type="submit" className="rounded-lg border border-red-300 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50">حذف</button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
