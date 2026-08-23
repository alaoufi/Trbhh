'use client';
import { useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { Tag, MapPin, Image as ImageIcon, Video, Mic, Phone, ShieldCheck, Eye, X, ArrowLeftRight, Timer, Star, User, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SubmitOverlay } from '@/components/submit-overlay';
import { RegionCityPicker } from '@/components/region-city-picker';
import { AudioRecorder } from '@/components/audio-recorder';
import { ImageUploader } from '@/components/image-uploader';
import { AdExtraFields } from '@/components/ad-extra-fields';
import { AdGallery } from '@/components/ad-gallery';
import { ExpandableDetail } from '@/components/expandable-detail';
import { formatPrice } from '@/lib/utils';
import { parseMapsUrl } from '@/lib/maps';

const MAX_VIDEO = 25 * 1024 * 1024; // 25MB

function Section({ icon: Icon, title, hint, children }: { icon: React.ElementType; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border-2 border-primary/20 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b-2 border-primary/20 bg-primary/10 px-4 py-2.5">
        <Icon className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-extrabold text-primary">{title}</h3>
      </div>
      <div className="space-y-3 p-4">
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        {children}
      </div>
    </section>
  );
}

type Country = { id: number; name: string };
type City = { id: number; name: string; countryId: number };
type Area = { id: number; name: string; cityId: number };
type Initial = Partial<{
  id: number; title: string; detail: string; price: number; adsType: string;
  categoryId: number; subcategoryId: number | null; countryId: number | null; cityId: number; areaId: number | null;
  phoneAllow: boolean; commentAllow: boolean; phone: string; whatsapp: string;
  lat: string | null; lng: string | null;
  oldPrice: number; stockState: number;
  priceType: string | null; rentPeriod: string | null;
}>;

// مدد التأجير المتاحة عند اختيار «سعر تأجير»
const RENT_PERIODS = ['بالساعة', 'يومي', 'أسبوعي', 'شهري', 'سنوي'];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button size="lg" disabled={pending}>{pending ? 'جارٍ الحفظ...' : label}</Button>;
}

// عنصر معلومة في شبكة المعاينة — مطابق لبطاقة صفحة الإعلان الحقيقية
function InfoItem({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-primary">
      <Icon className="h-5 w-5 shrink-0" />
      <span className="line-clamp-1 text-sm font-medium">{children}</span>
    </div>
  );
}

export function AdForm({
  action, countries, cities, areas = [], initial, submitLabel, error, dupLeft, dupId, needPrice, needBal, dest, limitMax, gapHours, gapWait, blockCat, banned, allowSchedule, scheduleMaxDays = 30, allowOldPrice, allowStock, urgentOffer, featuredOffer, identity,
}: {
  action: (fd: FormData) => void | Promise<void>;
  countries: Country[]; cities: City[]; areas?: Area[];
  initial?: Initial; submitLabel: string; error?: string; dupLeft?: string; dupId?: string;
  needPrice?: string; needBal?: string; dest?: string;
  limitMax?: string; gapHours?: string; gapWait?: string; blockCat?: string; banned?: boolean; allowSchedule?: boolean; scheduleMaxDays?: number;
  allowOldPrice?: boolean; allowStock?: boolean;
  /** عرض تسويقي لشارة «عاجل» عند النشر: باقتا 24/48 ساعة بأسعارهما ورصيد العضو */
  urgentOffer?: { packs: { hours: number; price: number }[]; balance: number };
  /** عرض تسويقي للتمييز ⭐ عند النشر: المدد المسعّرة ورصيد العضو الحالي */
  featuredOffer?: { options: { key: string; label: string; price: number }[]; balance: number };
  /** الهوية الفعّالة التي يُنشر باسمها — لعرضها في المعاينة كما ستظهر للزوّار */
  identity?: { name: string; isStore: boolean };
}) {
  const catLabel = ({ immoral: 'محتوى غير أخلاقي', drugs: 'مخدرات أو مسكرات', weapons: 'أسلحة أو محتوى أمني', political: 'محتوى سياسي مشبوه', charity: 'جمع تبرعات أو نشاط جمعية غير مرخّص' } as Record<string, string>)[blockCat || ''] || 'محتوى مخالف';
  const [adsType, setAdsType] = useState(initial?.adsType === 'request' ? 'request' : 'offer');
  const isReq = adsType === 'request';
  // نوع السعر للمعروض: تأجير (سعر + مدة) / بيع (سعر) / على السوم (بلا سعر)
  const [priceMode, setPriceMode] = useState<'rent' | 'sale' | 'som'>(
    initial?.priceType === 'rent' || initial?.priceType === 'som' ? initial.priceType
      : initial?.priceType === 'sale' || (initial?.price ?? 0) > 0 ? 'sale'
      : initial?.id ? 'som' : 'sale',
  );
  // الموقع موجّه للسعودية فقط
  const saudiId = useMemo(() => countries.find((c) => /سعود/.test(c.name))?.id ?? countries[0]?.id ?? 1, [countries]);
  const [geo, setGeo] = useState<{ lat: string; lng: string } | null>(
    initial?.lat && initial?.lng ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [geoBusy, setGeoBusy] = useState(false);
  const [mapLink, setMapLink] = useState('');
  const [mapErr, setMapErr] = useState('');
  // المكان اختياري بالكامل: افتراضياً «غير مطلوب» (مطوي) إلا عند تعديل إعلان له مكان محدد مسبقاً
  const [wantLocation, setWantLocation] = useState<boolean>(!!(initial?.cityId));

  function applyMapLink() {
    const ll = parseMapsUrl(mapLink);
    if (ll) {
      setGeo({ lat: ll.lat.toFixed(5), lng: ll.lng.toFixed(5) });
      setMapErr('');
    } else if (mapLink.trim()) {
      // couldn't read it here (e.g. shortened goo.gl link) — the server will try on submit
      setMapErr('سيتم محاولة قراءة الموقع من الرابط عند الحفظ. أو استخدم «موقعي الحالي».');
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) });
        setGeoBusy(false);
      },
      () => setGeoBusy(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  const regions = useMemo(() => cities.filter((c) => c.countryId === saudiId), [cities, saudiId]);

  const [imgBusy, setImgBusy] = useState(false);
  const [imgReady, setImgReady] = useState(0);
  const [imgFiles, setImgFiles] = useState<File[]>([]);

  // معاينة الإعلان قبل النشر (حيّة في المتصفح، بلا إنشاء مسودّة على الخادم) — مطابِقة تماماً
  // لتخطيط صفحة الإعلان الحقيقية (نفس المعرض والترتيب والأصناف).
  const formRef = useRef<HTMLFormElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  type PreviewData = { title: string; detail: string; price: number; oldPrice: number; images: string[]; cityName: string; areaName: string; urgent: boolean; featured: boolean };
  const [preview, setPreview] = useState<PreviewData | null>(null);
  function openPreview() {
    const f = formRef.current;
    if (!f) return;
    const get = (n: string) => ((f.querySelector(`[name="${n}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value || '').trim();
    previewUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    const urls = imgFiles.slice(0, 10).map((file) => URL.createObjectURL(file));
    previewUrlsRef.current = urls;
    setPreview({
      title: get('title'), detail: get('detail'),
      price: Number(get('price')) || 0, oldPrice: Number(get('old_price')) || 0,
      images: urls,
      cityName: cities.find((c) => String(c.id) === get('city_id'))?.name || '',
      areaName: areas.find((a) => String(a.id) === get('area_id'))?.name || '',
      urgent: !!get('urgent'), featured: !!get('featuredDur'),
    });
  }
  function closePreview() {
    previewUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    previewUrlsRef.current = [];
    setPreview(null);
  }

  const [vidName, setVidName] = useState('');
  const [vidErr, setVidErr] = useState('');
  function onVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) { setVidName(''); setVidErr(''); return; }
    if (f.size > MAX_VIDEO) { e.target.value = ''; setVidName(''); setVidErr('حجم الفيديو كبير (الحد 25 ميجابايت). اختر مقطعاً أقصر.'); return; }
    setVidErr(''); setVidName(f.name);
  }

  const field = 'h-11 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40';
  const lbl = 'mb-1 block text-sm font-bold text-foreground';

  return (
    <form action={action} ref={formRef} className="max-w-2xl space-y-4">
      <SubmitOverlay label="جارٍ رفع الإعلان…" />
      {initial?.id && <input type="hidden" name="adId" value={initial.id} />}
      {dest && <input type="hidden" name="dest" value={dest} />}

      {error === 'missing' && (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">
          أكمل الحقول الإجبارية: <b>العنوان</b> و<b>التفاصيل</b> قبل النشر.
        </div>
      )}
      {error === 'contact' && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          يجب إدخال رقم الجوال أو الواتساب قبل نشر الإعلان.
        </div>
      )}
      {error === 'pledge' && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          يجب الموافقة على التعهّد بصحة الإعلان وتحمّل المسؤولية قبل النشر.
        </div>
      )}
      {error === 'blocked' && (
        <div className="rounded-lg border-2 border-red-500 bg-red-100 p-3 text-sm font-bold text-red-900">
          🚫 رُفض هذا الإعلان لاحتوائه على <b>{catLabel}</b> — النشر ممنوع منعاً باتاً.
          {banned ? (
            <div className="mt-1">وتم <b>حظر حسابك فوراً</b> لمخالفة سياسة المحتوى. للاعتراض تواصل مع الإدارة.</div>
          ) : (
            <div className="mt-1">هذه <b>مخالفة مسجّلة</b> على حسابك. تكرار المحاولة يؤدي إلى <b>حظر الحساب فوراً</b>{dupLeft ? ` (تبقّى ${dupLeft})` : ''}.</div>
          )}
        </div>
      )}
      {error === 'toomany' && (
        <div className="rounded-lg border-2 border-red-500 bg-red-100 p-3 text-sm font-bold text-red-900">
          🚫 لم يُنشر إعلانك لاحتوائه كلماتٍ مخالفةً كثيرة{limitMax ? ` (أكثر من الحد المسموح: ${limitMax})` : ''}. عدّل المحتوى وأزِل الكلمات المخالفة ثم أعد النشر.
        </div>
      )}
      {error === 'image' && (
        <div className="rounded-lg border-2 border-red-500 bg-red-100 p-3 text-sm font-bold text-red-900">
          🚫 رُفضت إحدى الصور لاشتباه المحتوى بأنه غير لائق. الرجاء رفع صور مناسبة للإعلان فقط. تكرار المحاولة قد يؤدي لحظر الحساب.
        </div>
      )}
      {error === 'flood' && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          ⏳ أنت تنشر بسرعة كبيرة (إغراق). الرجاء الانتظار{gapWait ? ` نحو ${gapWait} ثانية` : ' قليلاً'} قبل نشر إعلان آخر.
        </div>
      )}
      {error === 'repeat' && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          يوجد تكرار مبالغ فيه للعبارات أو الكلمات في العنوان/التفاصيل. الرجاء كتابة وصف طبيعي دون تكرار الكلمات لأغراض محركات البحث.
        </div>
      )}
      {error === 'duplicate' && (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm font-medium text-red-800">
          ⚠️ لم يُقبل الإعلان لأن باقتك مجانية ولا تسمح بتكرار إعلانك أو النص المطابق لإعلان سابق لك. اشترك في باقة مدفوعة للاستفادة من عدد إعلاناتك اليومي.
          {dupId && Number(dupId) > 0 && (
            <span> الإعلان المطابق: <a href={`/ads/${dupId}`} target="_blank" rel="noopener noreferrer" className="font-bold underline">افتح الإعلان رقم {dupId}</a>.</span>
          )}
          {dupLeft && Number(dupLeft) > 0
            ? ` تبقّى لك ${dupLeft} ${Number(dupLeft) === 1 ? 'محاولة' : 'محاولات'} قبل حظر حسابك.`
            : ' هذه محاولتك الأخيرة قبل الحظر.'}
        </div>
      )}
      {error === 'crossdup' && (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm font-medium text-red-800">
          ⚠️ هذا الإعلان مطابق لإعلان منشور من عضو آخر ولم يُنشر — لا يُسمح بنسخ نفس النص.
          {dupId && Number(dupId) > 0 && (
            <span> الإعلان المطابق: <a href={`/ads/${dupId}`} target="_blank" rel="noopener noreferrer" className="font-bold underline">افتح الإعلان رقم {dupId}</a>.</span>
          )}
          {dupLeft && Number(dupLeft) > 0
            ? ` تبقّى لك ${dupLeft} ${Number(dupLeft) === 1 ? 'محاولة' : 'محاولات'} قبل حظر حسابك.`
            : ' هذه محاولتك الأخيرة قبل الحظر.'}
        </div>
      )}
      {error === 'needdup' && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          🔁 هذا الإعلان مكرّر. لنشره عدّة مرّات اشترِ <b>باقة تكرار</b> (مكرّر 3 أو مكرّر 5) من <Link href="/account/wallet" className="underline">محفظتي</Link>، ثم أعد النشر.
        </div>
      )}
      {error === 'needcredit' && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          💳 رصيدك لا يكفي لإتمام العملية.
          {needPrice && <span> المطلوب: <b>{needPrice} ر.س</b>.</span>}
          {needBal !== undefined && <span> رصيدك الحالي: <b>{needBal} ر.س</b>.</span>}
          <span> <Link href="/account/wallet#topup" className="font-bold text-primary underline">اشحن رصيدك من هنا</Link> ثم أعد المحاولة.</span>
        </div>
      )}
      {error === 'banned' && (
        <div className="rounded-lg border-2 border-red-500 bg-red-100 p-3 text-sm font-bold text-red-900">
          🚫 تم حظر حسابك بسبب تكرار نشر إعلانات مكرّرة. للتواصل مع الإدارة راسلنا.
        </div>
      )}
      {error === 'editWindow' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          انتهت المدة المسموح بها لتعديل هذا الإعلان{gapHours ? ` (${gapHours} ساعة من النشر)` : ''} حسب إعدادات الموقع. يمكنك التواصل مع الإدارة.
        </div>
      )}
      {error === 'limit' && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 text-red-900">
          <div className="flex items-center gap-2 text-base font-extrabold">🚫 لقد تجاوزت حدك اليومي</div>
          <p className="mt-1 text-sm font-medium">
            {limitMax ? `باقتك تسمح بـ ${limitMax} إعلان في اليوم، وقد استوفيت هذا العدد.` : 'لقد بلغت الحد اليومي المسموح به لعدد إعلاناتك.'}
            {' '}لم يُنشر إعلانك — يمكنك النشر مجدداً غداً.
          </p>
          <p className="mt-2 text-sm font-bold">هل ترغب بالاشتراك في باقة للحصول على عدد إعلانات أكبر؟</p>
          <Link href="/packages" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-white shadow-sm transition hover:opacity-90">
            نعم، اعرض الباقات المتاحة ←
          </Link>
        </div>
      )}
      {error === 'gap' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          يجب الانتظار{gapHours ? ` ${gapHours} ساعة` : ''} بين كل إعلان وآخر في باقتك{gapWait ? ` — تبقّى نحو ${gapWait} ساعة` : ''}. للترقية طالع صفحة <Link href="/packages" className="font-bold underline">الباقات</Link>.
        </div>
      )}

      <input type="hidden" name="adsType" value={adsType} />
      <div className="grid grid-cols-2 gap-2">
        {([{ v: 'offer', l: 'عرض', cls: 'border-primary bg-primary text-white' }, { v: 'request', l: 'طلب', cls: 'border-amber-500 bg-amber-500 text-white' }] as const).map((t) => (
          <button type="button" key={t.v} onClick={() => setAdsType(t.v)}
            className={`rounded-lg border-2 p-2.5 text-sm font-extrabold transition ${adsType === t.v ? t.cls : 'border-primary/25 bg-white text-foreground'}`}>
            {t.l}
          </button>
        ))}
      </div>
      <div className={`rounded-lg p-2 text-center text-xs font-bold ${isReq ? 'bg-amber-100 text-amber-900' : 'bg-primary/10 text-primary'}`}>
        {isReq ? 'إعلان طلب: تصف ما تبحث عنه، والصور والسعر اختيارية.' : 'إعلان عرض: تعرض منتجك أو خدمتك للبيع/الإيجار.'}
      </div>

      <Section icon={Tag} title={isReq ? 'بيانات الطلب' : 'بيانات العرض'}>
        <div>
          <label className={lbl}>{isReq ? 'ماذا تطلب؟' : 'عنوان الإعلان'}</label>
          <input name="title" required defaultValue={initial?.title} maxLength={255} className={field} placeholder={isReq ? 'مثال: مطلوب سيارة للشراء' : 'مثال: سيارة للبيع'} />
        </div>
        {isReq ? (
          <div>
            <label className={lbl}>الميزانية المتوقّعة</label>
            <input name="price" type="number" min="0" step="any" defaultValue={initial?.price || ''} className={field} placeholder="اختياري — إن تركته فارغاً يظهر «مطلوب» فقط" />
          </div>
        ) : (
          <div className="space-y-2">
            <label className={lbl}>السعر</label>
            <input type="hidden" name="priceType" value={priceMode} />
            {/* اختيار نوع السعر — والحقول تظهر حسب الاختيار */}
            <div className="grid grid-cols-3 gap-2">
              {([['rent', '🔑 سعر تأجير'], ['sale', '💰 سعر بيع'], ['som', '🤝 على السوم']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setPriceMode(k)}
                  className={`rounded-lg border-2 px-2 py-2.5 text-sm font-bold transition ${priceMode === k ? 'border-primary bg-primary text-white shadow' : 'border-primary/25 bg-white text-foreground/80 hover:border-primary/50'}`}>
                  {l}
                </button>
              ))}
            </div>
            {priceMode === 'rent' && (
              <div className="space-y-2 rounded-lg border-2 border-primary/15 bg-primary/5 p-3">
                <span className="block text-xs font-extrabold text-primary">حدد السعر ومدة التأجير <span className="font-normal text-muted-foreground">(كلاهما اختياري)</span></span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <input name="price" type="number" min="0" step="any" defaultValue={initial?.price || ''} className={field} placeholder="السعر (ر.س) — اختياري" />
                    <span className="block text-[11px] text-muted-foreground">اختياري — اتركه فارغاً لو تفضّل «على السوم»</span>
                  </div>
                  <div className="space-y-1">
                    <select name="rentPeriod" defaultValue={initial?.rentPeriod || ''} className={field}>
                      <option value="">مدة التأجير — اختياري</option>
                      {RENT_PERIODS.map((p0) => <option key={p0} value={p0}>{p0}</option>)}
                    </select>
                    <span className="block text-[11px] text-muted-foreground">اختياري — الافتراضي شهري إن لم تحدد</span>
                  </div>
                </div>
              </div>
            )}
            {priceMode === 'sale' && (
              <div className="space-y-1 rounded-lg border-2 border-primary/15 bg-primary/5 p-3">
                <span className="block text-xs font-extrabold text-primary">حدد سعر البيع</span>
                <input name="price" type="number" min="0" step="any" required defaultValue={initial?.price || ''} className={field} placeholder="السعر (ر.س)" />
              </div>
            )}
            {priceMode === 'som' && (
              <p className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-800">🤝 على السوم: لا يظهر سعر على إعلانك — يتفاوض معك المهتمّون مباشرة.</p>
            )}
          </div>
        )}
        {allowOldPrice && !isReq && priceMode !== 'som' && (
          <div>
            <label className={lbl}>السعر قبل الخصم <span className="font-normal text-muted-foreground">(اختياري — لعروض اليوم)</span></label>
            <input name="old_price" type="number" min="0" step="any" defaultValue={initial?.oldPrice || ''} className={field} placeholder="إن كان أعلى من السعر يظهر الخصم ويدخل إعلانك «عروض اليوم»" />
          </div>
        )}
        {allowStock && !isReq && (
          <div>
            <label className={lbl}>حالة التوفر</label>
            <select name="stock_state" defaultValue={String(initial?.stockState ?? 0)} className={field}>
              <option value="0">متوفر</option>
              <option value="1">نفدت الكمية</option>
              <option value="2">طلب مسبق</option>
            </select>
          </div>
        )}
        <div>
          <label className={lbl}>{isReq ? 'تفاصيل الطلب' : 'التفاصيل'}</label>
          <textarea name="detail" required defaultValue={initial?.detail} rows={6} className="w-full rounded-lg border-2 border-primary/25 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40" placeholder={isReq ? 'اكتب تفاصيل ما تبحث عنه بدقّة...' : 'اكتب وصفاً واضحاً للخدمة أو المنتج...'} />
        </div>
      </Section>

      <Section icon={Tag} title="تفاصيل إضافية">
        <AdExtraFields
          hideNegotiable={priceMode === 'som'}
          initial={{
            negotiable: initial?.priceType === 'negotiable',
            condition: (initial?.stockState === 0 ? 'new' : initial?.stockState === 1 ? 'used' : 'refurbished') as 'new' | 'used' | 'refurbished',
            delivery: false,
            warranty: '',
            quantity: 1,
          }}
        />
      </Section>

      <Section icon={MapPin} title="المكان">
        {/* هل تحديد المكان مطلوب؟ اختيار «غير مطلوب» يطوي الخيارات فلا تزحم النموذج */}
        <div className="flex gap-2">
          <button type="button" onClick={() => setWantLocation(false)} className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-bold ${!wantLocation ? 'border-primary bg-primary text-white' : 'border-primary/25 bg-white text-primary'}`}>
            المكان غير مطلوب
          </button>
          <button type="button" onClick={() => setWantLocation(true)} className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-bold ${wantLocation ? 'border-primary bg-primary text-white' : 'border-primary/25 bg-white text-primary'}`}>
            تحديد المكان
          </button>
        </div>
        {wantLocation && (
        <>
        <input type="hidden" name="country_id" value={saudiId} />
        <RegionCityPicker regions={regions} areas={areas} initialRegion={initial?.cityId} initialArea={initial?.areaId} />
        <div className="rounded-lg border-2 border-dashed border-primary/25 bg-accent/30 p-3">
          <p className="mb-2 text-sm font-bold text-primary">تحديد الموقع بدقّة <span className="font-normal text-muted-foreground">(اختياري)</span></p>
          <input type="hidden" name="lat" value={geo?.lat ?? ''} />
          <input type="hidden" name="lng" value={geo?.lng ?? ''} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={useMyLocation} disabled={geoBusy} className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
              <MapPin className="h-4 w-4" /> {geoBusy ? 'جارٍ تحديد الموقع…' : 'استخدم موقعي الحالي'}
            </button>
            {geo && <span className="text-xs font-medium text-green-700">✓ تم تحديد الموقع ({geo.lat}, {geo.lng})</span>}
            {geo && <button type="button" onClick={() => setGeo(null)} className="text-xs text-red-600 hover:underline">إزالة</button>}
          </div>
          {/* أو الصق رابط الموقع من خرائط قوقل (اختياري) */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              name="mapLink"
              value={mapLink}
              onChange={(e) => setMapLink(e.target.value)}
              placeholder="أو الصق رابط الموقع من خرائط قوقل"
              className="h-10 min-w-[200px] flex-1 rounded-lg border-2 border-primary/25 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button type="button" onClick={applyMapLink} className="rounded-lg border-2 border-primary/30 px-3 py-2 text-sm font-bold text-primary hover:bg-accent">
              استخدم الرابط
            </button>
          </div>
          {mapErr && <p className="mt-1 text-xs font-bold text-red-600">{mapErr}</p>}
        </div>
        </>
        )}
      </Section>

      <Section icon={ImageIcon} title="الصور" hint={initial?.id ? 'أضِف المزيد من الصور (تُضغط تلقائياً للرفع السريع).' : 'حتى 10 صور — تُضغط تلقائياً للرفع السريع.'}>
        <ImageUploader
          name="images"
          maxImages={10}
          onBusyChange={setImgBusy}
          onImagesChange={(files) => { setImgReady(files.length); setImgFiles(files); }}
        />
        {imgBusy && <p className="text-xs font-bold text-primary">⏳ جارٍ تجهيز الصور…</p>}
        {!imgBusy && imgReady > 0 && <p className="text-xs font-bold text-green-600">✓ {imgReady} صورة جاهزة</p>}
      </Section>

      <Section icon={Video} title="فيديو" hint="مقطع قصير للإعلان (اختياري، الحد 25 ميجابايت).">
        <input name="video" type="file" accept="video/*" onChange={onVideo} className="w-full rounded-lg border-2 border-primary/25 bg-white p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:font-bold file:text-white" />
        {vidName && <p className="text-xs font-bold text-green-600">✓ {vidName}</p>}
        {vidErr && <p className="text-xs font-bold text-red-600">{vidErr}</p>}
      </Section>

      <Section icon={Mic} title="تسجيل صوتي" hint="سجّل رسالة صوتية تعرّف بإعلانك (اختياري، حتى دقيقتين).">
        <AudioRecorder name="audio" />
      </Section>

      <Section icon={Phone} title="وسيلة التواصل">
        <p className="text-xs text-muted-foreground">يجب إدخال رقم الجوال أو الواتساب على الأقل. <span className="font-bold text-red-600">*</span></p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl}>رقم الجوال</label>
            <input name="phone" type="tel" inputMode="tel" defaultValue={initial?.phone ?? ''} maxLength={20} className={field} placeholder="05xxxxxxxx" />
          </div>
          <div>
            <label className={lbl}>رقم الواتساب</label>
            <input name="whatsapp" type="tel" inputMode="tel" defaultValue={initial?.whatsapp ?? ''} maxLength={20} className={field} placeholder="9665xxxxxxxx" />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="phoneAllow" defaultChecked={initial?.phoneAllow ?? true} className="accent-primary" /> إظهار رقم الجوال</label>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="commentAllow" defaultChecked={initial?.commentAllow ?? true} className="accent-primary" /> السماح بالتعليقات</label>
        </div>
      </Section>

      <Section icon={ShieldCheck} title="التعهّد">
        <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-900">
          <input type="checkbox" name="pledge" required className="mt-0.5 h-4 w-4 accent-primary" />
          <span>أتعهّد بأن جميع بيانات هذا الإعلان صحيحة، وأتحمّل كامل المسؤولية عنه. وأقرّ أن التعامل والدفع يتمّان خارج المنصة، وأن المنصة وسيلة عرض وربط فقط.</span>
        </label>
      </Section>

      {allowSchedule && (
        <label className="block space-y-1 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
          <span className="text-sm font-bold text-sky-800">🕒 جدولة النشر (اختياري)</span>
          <span className="block text-xs text-muted-foreground">اترك الحقل فارغاً للنشر فوراً، أو اختر موعداً {scheduleMaxDays > 0 ? `(حتى ${scheduleMaxDays} يوماً)` : ''} ليُنشر إعلانك تلقائياً وقتها.</span>
          <input type="datetime-local" name="publishAt" className="h-11 w-full rounded-lg border border-sky-300 bg-background px-3 text-sm" dir="ltr" />
        </label>
      )}

      {/* شرح متحرك: كيف تزيد المميزات تسويق إعلانك */}
      {(featuredOffer || urgentOffer) && (
        <a href="/guide/how/ad-boost" target="_blank" className="block rounded-xl bg-red-600 p-3 text-center text-sm font-extrabold text-white shadow hover:bg-red-700">
          🎬 شاهد: مميزات تزيد في تسويق إعلانك (شرح متحرك)
          <span className="mt-1 block text-xs font-bold underline underline-offset-2">اضغط هنا</span>
        </a>
      )}

      {/* التمييز ⭐ — عرض تسويقي بارز عند النشر: إطار ذهبي ومقدمة القوائم طوال المدة */}
      {featuredOffer && featuredOffer.options.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50/70 p-3 shadow-sm">
          <span className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-amber-800">
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold text-white">⭐ مميّز</span>
            ميّز إعلانك — إطار ذهبي بارز ومقدمة القوائم طوال المدة
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            الإعلانات المميّزة تحصد مشاهدات وتواصلاً أعلى بكثير — اختر المدة وتُخصم من رصيدك عند النشر.
            {' '}رصيدك الحالي: <b className="text-amber-800">{featuredOffer.balance} ر.س</b>
            {' '}(<a href="/account/wallet#topup" target="_blank" className="font-bold text-primary underline">اشحن رصيدك</a> إن احتجت — سيُنشر إعلانك على كل حال).
          </span>
          {/* معاينة: هكذا سيظهر إعلانك مميزاً */}
          <div className="mt-2 overflow-hidden rounded-xl border-2 border-amber-400 bg-gradient-to-b from-amber-50 to-white shadow ring-2 ring-amber-400/60">
            <div className="flex items-center justify-center gap-1 bg-gradient-to-l from-amber-500 to-amber-600 py-0.5 text-[10px] font-extrabold text-white">👑 إعلان ذهبي مميّز</div>
            <div className="flex items-center gap-2 p-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-lg">📦</span>
              <span className="min-w-0"><span className="block truncate text-xs font-extrabold text-slate-800">عنوان إعلانك هنا</span><span className="block text-[10px] text-muted-foreground">هكذا سيظهر إعلانك — بإطار ذهبي وفي مقدمة القوائم</span></span>
            </div>
          </div>
          <select name="featuredDur" defaultValue="" className="mt-2 h-11 w-full rounded-lg border-2 border-amber-300 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/50">
            <option value="">بدون تمييز</option>
            {featuredOffer.options.map((o) => (
              <option key={o.key} value={o.key} disabled={o.price > featuredOffer.balance}>⭐ تمييز {o.label} — {o.price} ر.س{o.price > featuredOffer.balance ? ' (رصيدك لا يكفي)' : ''}</option>
            ))}
          </select>
          {featuredOffer.options.every((o) => o.price > featuredOffer.balance) && (
            <p className="mt-1.5 text-xs font-bold text-red-700">💳 رصيدك لا يكفي لأي مدّة تمييز — <a href="/account/wallet#topup" target="_blank" className="underline">اشحن رصيدك</a> ثم عد لاختيارها.</p>
          )}
        </div>
      )}

      {/* شارة عاجل — باقتا 24/48 ساعة: يغطي الرصيد → خصم فوري، لا يغطي → دعوة لشحن الرصيد */}
      {urgentOffer && urgentOffer.packs.length > 0 && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50/70 p-3 shadow-sm">
          <span className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-red-700">
            <span className="animate-pulse rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white">🔥 عاجل</span>
            أضف شارة «عاجل» لإعلانك — اختر الباقة
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            تجعل إعلانك يلفت الأنظار بشارة حمراء نابضة في كل القوائم وصفحة الإعلان — تُخصم من رصيدك عند النشر.
            {' '}رصيدك الحالي: <b className="text-red-700">{urgentOffer.balance} ر.س</b>
            {' '}(<a href="/account/wallet#topup" target="_blank" className="font-bold text-primary underline">اشحن رصيدك</a> إن احتجت — سيُنشر إعلانك على كل حال).
          </span>
          {/* معاينة: هكذا سيظهر إعلانك بشارة عاجل */}
          <span className="relative mt-2 block overflow-hidden rounded-xl border-2 border-red-200 bg-white p-2 shadow">
            <span className="absolute left-2 top-2 animate-pulse rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-extrabold text-white">🔥 عاجل</span>
            <span className="flex items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-50 text-lg">📦</span>
              <span className="min-w-0"><span className="block truncate text-xs font-extrabold text-slate-800">عنوان إعلانك هنا</span><span className="block text-[10px] text-muted-foreground">هكذا سيظهر إعلانك — بشارة حمراء نابضة تلفت العين</span></span>
            </span>
          </span>
          <select name="urgent" defaultValue="" className="mt-2 h-11 w-full rounded-lg border-2 border-red-300 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-red-400/50">
            <option value="">بدون شارة عاجل</option>
            {urgentOffer.packs.map((p0) => (
              <option key={p0.hours} value={p0.hours} disabled={p0.price > urgentOffer.balance}>🔥 باقة {p0.hours} ساعة — {p0.price} ر.س{p0.price > urgentOffer.balance ? ' (رصيدك لا يكفي)' : ''}</option>
            ))}
          </select>
          {urgentOffer.packs.every((p0) => p0.price > urgentOffer.balance) && (
            <p className="mt-1.5 text-xs font-bold text-red-700">💳 رصيدك لا يكفي لأي باقة عاجل — <a href="/account/wallet#topup" target="_blank" className="underline">اشحن رصيدك</a> ثم عد لاختيارها.</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={openPreview} className="inline-flex h-11 items-center gap-1.5 rounded-lg border-2 border-primary/40 bg-white px-4 text-sm font-extrabold text-primary shadow-sm transition hover:bg-primary/5">
          <Eye className="h-4 w-4" /> معاينة الإعلان
        </button>
        <Submit label={submitLabel} />
      </div>

      {/* معاينة الإعلان قبل النشر — تُطابق تخطيط صفحة الإعلان الحقيقية بالكامل (نفس المعرض والترتيب) */}
      {preview && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-3" onClick={closePreview}>
          <div className="my-4 w-full max-w-md overflow-hidden rounded-2xl bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-primary/5 px-4 py-2.5 backdrop-blur">
              <span className="flex items-center gap-1.5 text-sm font-extrabold text-primary"><Eye className="h-4 w-4" /> معاينة إعلانك — هكذا سيظهر للزوّار</span>
              <button type="button" onClick={closePreview} aria-label="إغلاق المعاينة" className="rounded-full p-1 text-muted-foreground hover:bg-black/5"><X className="h-5 w-5" /></button>
            </div>

            {/* نفس ترتيب صفحة الإعلان: المعرض ← العنوان ← بطاقة المعلومات ← السعر+الوصف */}
            <div className="max-h-[74vh] space-y-4 overflow-y-auto p-4">
              {preview.images.length > 0
                ? <AdGallery images={preview.images} title={preview.title || 'إعلانك'} special={preview.featured} adsType={adsType} />
                : <div className="grid h-48 w-full place-items-center rounded-2xl bg-muted text-sm text-muted-foreground">لم تُضِف صوراً بعد</div>}

              <h1 className="text-xl font-bold text-primary">{preview.title || <span className="text-muted-foreground">عنوان الإعلان…</span>}</h1>

              <div className="card-3d grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl p-4">
                <InfoItem icon={ArrowLeftRight}>{isReq ? 'طلب' : 'عرض'}</InfoItem>
                <InfoItem icon={Timer}>الآن</InfoItem>
                <InfoItem icon={MapPin}>{preview.areaName ? `${preview.areaName} - ${preview.cityName}` : (preview.cityName || 'غير محدد')}</InfoItem>
                <div className="flex items-center gap-2 text-primary">
                  {identity?.isStore ? <Store className="h-5 w-5 shrink-0" /> : <User className="h-5 w-5 shrink-0" />}
                  <span className="line-clamp-1 text-sm font-medium">{identity?.name || 'باسم هويتك'}{identity?.isStore && <span className="mr-1 rounded bg-primary/10 px-1 text-[10px] font-bold text-primary">متجر</span>}</span>
                </div>
                <InfoItem icon={Star}>جديد</InfoItem>
                <InfoItem icon={Eye}>0 مشاهدة</InfoItem>
              </div>

              <div className="card-3d rounded-2xl p-4">
                {preview.urgent && <span className="mb-2 inline-block animate-pulse rounded-full bg-red-600 px-3 py-1 text-xs font-extrabold text-white shadow">🔥 عاجل</span>}
                <div className="mb-3 flex flex-wrap items-baseline gap-2">
                  {(preview.price > 0 || isReq) && <span className="text-2xl font-bold text-primary">{preview.price > 0 ? formatPrice(preview.price) : 'مطلوب'}</span>}
                  {preview.price > 0 && priceMode === 'rent' && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-extrabold text-primary">🔑 تأجير {(formRef.current?.querySelector('[name="rentPeriod"]') as HTMLSelectElement | null)?.value || 'شهري'}</span>}
                  {preview.price > 0 && priceMode === 'sale' && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800">💰 بيع</span>}
                  {preview.oldPrice > preview.price && preview.price > 0 && (
                    <>
                      <span className="text-sm text-muted-foreground line-through" dir="ltr">{formatPrice(preview.oldPrice)}</span>
                      <span className="rounded bg-rose-600 px-2 py-0.5 text-xs font-extrabold text-white">خصم {Math.round((1 - preview.price / preview.oldPrice) * 100)}٪</span>
                    </>
                  )}
                </div>
                <ExpandableDetail text={preview.detail || ''} />
              </div>
            </div>

            {/* تذييل ثابت: متابعة النشر (يُرسل النموذج مباشرةً) أو الرجوع للتعديل */}
            <div className="sticky bottom-0 space-y-2 border-t bg-background p-3">
              <p className="text-center text-[11px] font-bold text-amber-700">👁 معاينة فقط — لم يُنشر إعلانك بعد.</p>
              <div className="flex gap-2">
                <button type="button" onClick={closePreview} className="h-11 flex-1 rounded-lg border-2 border-primary/30 bg-white px-4 text-sm font-extrabold text-primary hover:bg-primary/5">✏ رجوع للتعديل</button>
                <Button type="submit" size="lg" className="flex-1">متابعة النشر ✓</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
