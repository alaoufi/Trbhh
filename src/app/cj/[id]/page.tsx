import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShoppingCart, CreditCard, Truck, Heart, Star, RotateCcw, Lock } from 'lucide-react';
import { ShareButtons } from '@/components/share-buttons';
import { SITE } from '@/lib/constants';
import { getSession } from '@/lib/auth';
import { hasAnyAdmin } from '@/lib/roles';
import { isActiveAgent } from '@/lib/cj/agents';
import { cjProductOrderCount } from '@/lib/cj/mapping';
import { saveCjStorefrontEdit, hideCjStorefront, deleteCjStorefront } from '../../admin/suppliers/cj/actions';

const editInput = 'mt-1 w-full rounded-lg border border-primary/25 bg-white px-3 py-2 text-sm';
import { cjStorefrontView, importedToAdCard, cjImg } from '@/lib/cj/storefront';
import { getStorefrontCjProduct, listStorefrontCjProducts, parseCjImages, setCjProductGallery, parseCjDetails } from '@/lib/cj/mapping';
import { getProduct } from '@/lib/cj/client';
import { cjSyncSettings } from '@/lib/cj/sync';
import { AdGrid } from '@/components/ad-card';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تفاصيل السلعة', robots: { index: false, follow: false } };

const sar = (m: number) => `${new Intl.NumberFormat('en-US').format(Math.round(m / 100))} ر.س`;

/** ينظّف وصف CJ (قد يحوي HTML) إلى نص عربي مقروء بفقرات ونقاط. */
function cleanDescription(raw: string): string {
  let s = raw;
  // فكّ الترميز أولاً (وإلا تبقى <p> نصّاً بعد إزالة الوسوم).
  s = s.replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, '&');
  s = s.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\s*li[^>]*>/gi, '\n• ').replace(/<\s*\/\s*(p|div|li|h[1-6]|tr|ul|ol)\s*>/gi, '\n');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif)\S*/gi, '');
  return s
    .replace(/[ \t ]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default async function CjStoreProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const view = await cjStorefrontView();
  if (!view.visible) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold text-primary">قريباً</h1>
        <p className="mt-3 text-muted-foreground">هذا القسم قيد التجهيز وسيُعلَن قريباً.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 font-bold text-white">العودة للرئيسية</Link>
      </div>
    );
  }
  const { id: idStr } = await params;
  const sp = await searchParams;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const readyOnly = !view.isStaff;
  const p = await getStorefrontCjProduct(id, readyOnly);
  if (!p) notFound();

  const price = p.sale_price_override_minor ?? p.sale_price_minor;
  const title = p.name_ar || p.name || 'سلعة';
  let gallery = parseCjImages(p);
  // إصلاح ذاتي: لو لا صور مخزَّنة، اجلبها حيّاً من CJ واحفظ روابطها (لا تُخزَّن صور، روابط فقط).
  if (!gallery.length && p.cj_product_id) {
    const det = await getProduct(p.cj_product_id).catch(() => null);
    if (det && det.ok) {
      gallery = [...new Set([det.data.productImage, ...(det.data.variants ?? []).map((v) => v.variantImage)].filter((s): s is string => !!s))];
      if (gallery.length) await setCjProductGallery(id, gallery);
    }
  }
  // صلاحية الإدارة: الإدارة (integrations:manage_settings) أو وكيل السلعة النشط.
  const session = await getSession();
  const isAdmin = session ? await hasAnyAdmin(session.uid) : false;
  const isProductAgent = !!(session && p.agent_user_id != null && p.agent_user_id === BigInt(session.uid) && (await isActiveAgent(session.uid)));
  const canManage = isAdmin || isProductAgent;
  const hasActivity = canManage ? (await cjProductOrderCount(p.cj_product_id)) > 0 : false;
  const description = p.display_description_ar ? cleanDescription(p.display_description_ar) : '';
  const details = parseCjDetails(p);
  const settings = await cjSyncSettings().catch(() => null);
  const shippingText = settings ? sar(settings.shippingMinor) : null;
  // خيارات المتغيّرات: أسماء CJ تأتي كتوليفات (مثل «أسود-XL») فتظهر عشرات الأسطر
  // المكرّرة. نفكّكها إلى قيم مفردة مميّزة (لون/مقاس) لتظهر كوسوم قصيرة مرتّبة.
  const variantNames = [...new Set((details?.variants ?? []).map((v) => v.name).filter(Boolean))];
  const optionTokens: string[] = [];
  const seenTok = new Set<string>();
  for (const nm of variantNames) {
    for (const tok of nm.split(/[-/,;|·、]+|\s{2,}/).map((t) => t.replace(/[ ​-‍]+/g, ' ').trim()).filter(Boolean)) {
      const key = tok.toLowerCase();
      // تجاهُل الوسوم الفارغة/بلا قيمة (رموز فقط) — يجب أن تحوي حرفاً أو رقماً.
      if (!seenTok.has(key) && tok.length <= 24 && /[\p{L}\p{N}]/u.test(tok)) { seenTok.add(key); optionTokens.push(tok); }
    }
  }
  const weightLabel = details && details.weightMin ? (details.weightMax && details.weightMax !== details.weightMin ? `${details.weightMin}–${details.weightMax} غ` : `${details.weightMin} غ`) : null;
  const others = (await listStorefrontCjProducts(readyOnly, 24)).filter((r) => r.image && Number(r.id) !== id).slice(0, 12).map(importedToAdCard);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-5">
      {!view.isPublic && view.isStaff && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"><b>معاينة إدارية</b> — مخفية عن الأعضاء والزوار.</p>
      )}
      {sp.edited === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم حفظ التعديل، وتعلّمت الترجمة التصحيح.</p>}
      {sp.err === 'has_activity' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">لا يمكن الحذف — للسلعة نشاط (طلبات/تعليقات). يمكنك الإخفاء بدلاً من الحذف.</p>}

      {/* إدارة السلعة: الإدارة أو وكيلها — تعديل/إخفاء/حذف */}
      {canManage && (
        <div className="card-3d rounded-2xl p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-primary">إدارة السلعة{isProductAgent && !isAdmin ? ' (وكيلها)' : ''}:</span>
            {/* إخفاء/إظهار */}
            <form action={hideCjStorefront}><input type="hidden" name="id" value={id} /><input type="hidden" name="hidden" value={p.hidden ? '0' : '1'} /><button className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">{p.hidden ? 'إظهار' : 'إخفاء'}</button></form>
            {/* حذف — فقط إن لا نشاط */}
            {hasActivity
              ? <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">الحذف متعذّر (يوجد نشاط) — الإخفاء متاح</span>
              : <form action={deleteCjStorefront}><input type="hidden" name="id" value={id} /><button className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-bold text-red-700">حذف</button></form>}
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-bold text-primary">✎ تعديل مباشر (يُحفظ ويُعلّم الترجمة)</summary>
            <form action={saveCjStorefrontEdit} className="mt-2 space-y-2 text-sm">
              <input type="hidden" name="id" value={id} />
              <label className="block">العنوان العربي<input name="nameAr" defaultValue={p.name_ar} className={editInput} placeholder="مثال: ساعة يد رجالية" /></label>
              <label className="block">الوصف العربي<textarea name="descriptionAr" rows={4} defaultValue={p.display_description_ar ?? ''} className={editInput} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">التصنيف<input name="trbhhCategory" defaultValue={p.trbhh_category} className={editInput} /></label>
                <label className="block">السعر (ر.س) — فارغ = المحسوب<input name="priceSar" inputMode="decimal" defaultValue={p.sale_price_override_minor != null ? (p.sale_price_override_minor / 100).toString() : ''} placeholder={(p.sale_price_minor / 100).toString()} className={editInput} /></label>
              </div>
              <div className="flex items-center gap-2">
                <button className="rounded-lg bg-primary px-4 py-2 font-bold text-white">حفظ التعديل</button>
                <span className="text-xs text-muted-foreground">تصحيح العنوان/الوصف يُحفظ في ذاكرة الترجمة ويُطبَّق على السلع المشابهة.</span>
              </div>
            </form>
          </details>
        </div>
      )}

      <nav className="text-sm"><Link href="/cj" className="text-primary hover:underline">‹ رجوع للسلع والإعلانات</Link></nav>

      <div className="grid gap-5 md:grid-cols-2">
        {/* معرض الصور */}
        <div className="space-y-2">
          <div className="card-3d overflow-hidden rounded-2xl bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {gallery[0]
              ? <img src={cjImg(gallery[0])} alt={title} className="mx-auto aspect-square max-h-[60vh] w-full object-contain" />
              : <div className="grid aspect-square w-full place-items-center bg-primary/5 text-muted-foreground">لا صورة</div>}
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {gallery.slice(0, 8).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={cjImg(src)} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-primary/15 bg-white object-contain" loading="lazy" />
              ))}
            </div>
          )}
        </div>

        {/* المعلومات — خلطة هجين (علي/Temu/أمازون): تقييم/مفضّلة/مشاركة/سلة/شحن */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-extrabold leading-7">{title}</h1>
            <div className="flex shrink-0 items-center gap-1">
              <button aria-label="أضف للمفضّلة" className="grid h-9 w-9 place-items-center rounded-full border border-primary/20 text-rose-500 hover:bg-rose-50"><Heart className="h-4 w-4" /></button>
              <ShareButtons url={`https://${SITE.domain}/cj/${id}`} title={title} iconOnly compact />
            </div>
          </div>

          {/* تقييم (بلا أرقام وهمية) */}
          <div className="flex items-center gap-2 text-sm">
            <span className="flex text-slate-300">{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4" />)}</span>
            <span className="text-xs text-muted-foreground">جديد — لا تقييمات بعد</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {p.trbhh_category && <span className="rounded-full bg-primary/10 px-2 py-1 font-bold text-primary">{p.trbhh_category}</span>}
            <span className="rounded-full bg-emerald-100 px-2 py-1 font-bold text-emerald-700">متوفّر</span>
          </div>

          <div className="flex items-end gap-2">
            <div className="text-3xl font-extrabold text-red-700">{sar(price)}</div>
            <div className="pb-1 text-xs text-muted-foreground">شامل تقدير الشحن</div>
          </div>

          {/* خيارات المتغيّرات (ألوان/مقاسات) — قيم مفردة مميّزة */}
          {optionTokens.length > 1 && (
            <div className="space-y-1">
              <div className="text-xs font-bold text-muted-foreground">الخيارات المتاحة:</div>
              <div className="flex flex-wrap gap-1.5">
                {optionTokens.slice(0, 16).map((n, i) => <span key={i} className="rounded-lg border border-primary/25 bg-white px-2 py-1 text-xs">{n}</span>)}
                {optionTokens.length > 16 && <span className="px-1 text-xs text-muted-foreground">+{optionTokens.length - 16}</span>}
              </div>
            </div>
          )}

          {/* أزرار السلة/الشراء (معطّلة حتى تفعيل الشراء) */}
          <div className="grid grid-cols-2 gap-2">
            <button disabled aria-disabled className="flex cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border-2 border-primary/30 bg-white px-4 py-3 font-bold text-primary/60"><ShoppingCart className="h-4 w-4" /> أضف للسلة</button>
            <button disabled aria-disabled className="flex cursor-not-allowed items-center justify-center gap-1.5 rounded-xl bg-primary/50 px-4 py-3 font-bold text-white"><CreditCard className="h-4 w-4" /> شراء الآن</button>
          </div>
          <p className="rounded-lg bg-amber-50 p-2 text-center text-xs font-bold text-amber-800">الشراء قريباً — قيد التجهيز</p>

          {/* الشحن والضمان (قائمة بأسلوب التسوّق) */}
          <div className="card-3d divide-y rounded-2xl text-sm">
            <div className="flex items-center gap-2 p-3"><Truck className="h-4 w-4 text-emerald-600" /><div><div className="font-bold">الشحن إلى السعودية</div><div className="text-xs text-muted-foreground">تقدير الشحن: {shippingText ?? 'يُحتسب عند الطلب'} · المدة تُحدَّد عند تأكيد الطلب</div></div></div>
            <div className="flex items-center gap-2 p-3"><RotateCcw className="h-4 w-4 text-emerald-600" /><div><div className="font-bold">إرجاع/استبدال وفق السياسة</div><div className="text-xs text-muted-foreground">تُفصَّل شروط الإرجاع عند تفعيل الشراء</div></div></div>
            <div className="flex items-center gap-2 p-3"><Lock className="h-4 w-4 text-emerald-600" /><div><div className="font-bold">دفع آمن وحماية للطلب</div><div className="text-xs text-muted-foreground">المدفوعات والبيانات محميّة حتى الاستلام</div></div></div>
          </div>
        </div>
      </div>

      {/* المواصفات (جدول منظّم) */}
      <section className="space-y-2">
        <h2 className="text-lg font-extrabold text-primary">المواصفات</h2>
        <div className="card-3d overflow-hidden rounded-2xl text-sm">
          {[
            ['التصنيف', p.trbhh_category || '—'],
            ['التوفّر', 'متوفّر'],
            ['عدد الخيارات', details ? String(details.variantCount || variantNames.length || '—') : '—'],
            ['الوزن', weightLabel ?? '—'],
            ['بلد الشحن', 'يُشحن إلى السعودية'],
            ['السعر', `${sar(price)} (شامل تقدير الشحن)`],
          ].map(([k, v], i) => (
            <div key={i} className={`flex justify-between gap-3 px-4 py-2.5 ${i % 2 ? 'bg-secondary/30' : ''}`}>
              <span className="text-muted-foreground">{k}</span><span className="text-left font-bold">{v}</span>
            </div>
          ))}
        </div>
      </section>

      {/* الوصف — منسّق بفقرات ونقاط */}
      {description && (
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-primary">التفاصيل</h2>
          <div className="card-3d rounded-2xl p-4 text-sm leading-8">
            {description.split(/\n{2,}/).map((para, i) => (
              <p key={i} className="mb-3 whitespace-pre-line last:mb-0">{para}</p>
            ))}
          </div>
        </section>
      )}

      {/* التقييمات (تُفعَّل مع الشراء — بلا أرقام وهمية) */}
      <section className="space-y-2">
        <h2 className="text-lg font-extrabold text-primary">التقييمات</h2>
        <div className="card-3d flex items-center gap-3 rounded-2xl p-4 text-sm">
          <span className="flex text-slate-300">{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-5 w-5" />)}</span>
          <span className="text-muted-foreground">لا تقييمات بعد — ستظهر تقييمات المشترين بعد تفعيل الشراء.</span>
        </div>
      </section>

      {/* سلع أخرى (نفس تصميم بطاقات الإعلانات) */}
      {others.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-primary">سلع أخرى قد تعجبك</h2>
          <AdGrid ads={others} />
        </section>
      )}
    </div>
  );
}
