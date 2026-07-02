'use client';
import { useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Tag, MapPin, Image as ImageIcon, Video, Mic, Phone, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SubmitOverlay } from '@/components/submit-overlay';
import { compressInputFiles } from '@/lib/image-compress';
import { CityCombobox } from '@/components/city-combobox';
import { AudioRecorder } from '@/components/audio-recorder';

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

type Cat = { id: number; name: string };
type Sub = { id: number; name: string; categoryId: number };
type Country = { id: number; name: string };
type City = { id: number; name: string; countryId: number };
type Initial = Partial<{
  id: number; title: string; detail: string; price: number; adsType: string;
  categoryId: number; subcategoryId: number | null; countryId: number | null; cityId: number;
  phoneAllow: boolean; commentAllow: boolean; phone: string; whatsapp: string;
  lat: string | null; lng: string | null;
}>;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button size="lg" disabled={pending}>{pending ? 'جارٍ الحفظ...' : label}</Button>;
}

export function AdForm({
  action, categories, subcategories, countries, cities, initial, submitLabel, error, dupLeft, limitMax, gapHours, gapWait,
}: {
  action: (fd: FormData) => void | Promise<void>;
  categories: Cat[]; subcategories: Sub[]; countries: Country[]; cities: City[];
  initial?: Initial; submitLabel: string; error?: string; dupLeft?: string;
  limitMax?: string; gapHours?: string; gapWait?: string;
}) {
  const [category, setCategory] = useState(initial?.categoryId ?? categories[0]?.id ?? 0);
  const [country, setCountry] = useState(initial?.countryId ?? countries[0]?.id ?? 0);
  const [geo, setGeo] = useState<{ lat: string; lng: string } | null>(
    initial?.lat && initial?.lng ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [geoBusy, setGeoBusy] = useState(false);

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
  const subs = useMemo(() => subcategories.filter((s) => s.categoryId === category), [subcategories, category]);
  const filteredCities = useMemo(
    () => cities.filter((c) => c.countryId === country),
    [cities, country],
  );

  const [imgBusy, setImgBusy] = useState(false);
  const [imgReady, setImgReady] = useState(0);
  async function onImages(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    if (!input.files?.length) { setImgReady(0); return; }
    setImgBusy(true);
    await compressInputFiles(input); // shrink before upload (fast on slow نت)
    setImgReady(input.files?.length || 0);
    setImgBusy(false);
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
    <form action={action} className="max-w-2xl space-y-4">
      <SubmitOverlay label="جارٍ رفع الإعلان…" />
      {initial?.id && <input type="hidden" name="adId" value={initial.id} />}

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
      {error === 'repeat' && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          يوجد تكرار مبالغ فيه للعبارات أو الكلمات في العنوان/التفاصيل. الرجاء كتابة وصف طبيعي دون تكرار الكلمات لأغراض محركات البحث.
        </div>
      )}
      {error === 'duplicate' && (
        <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm font-medium text-red-800">
          ⚠️ لا تُكرّر نفس الإعلان. هذا الإعلان مطابق لإعلان سابق لك ولم يُنشر.
          {dupLeft && Number(dupLeft) > 0
            ? ` تبقّى لك ${dupLeft} ${Number(dupLeft) === 1 ? 'محاولة' : 'محاولات'} قبل حظر حسابك.`
            : ' هذه محاولتك الأخيرة قبل الحظر.'}
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
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          لقد بلغت الحد اليومي لعدد الإعلانات في باقتك{limitMax ? ` (${limitMax} إعلان/اليوم)` : ''}. للمزيد بإمكانك ترقية باقتك من صفحة <a href="/packages" className="font-bold underline">الباقات</a>.
        </div>
      )}
      {error === 'gap' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          يجب الانتظار{gapHours ? ` ${gapHours} ساعة` : ''} بين كل إعلان وآخر في باقتك{gapWait ? ` — تبقّى نحو ${gapWait} ساعة` : ''}. للترقية طالع صفحة <a href="/packages" className="font-bold underline">الباقات</a>.
        </div>
      )}

      <div className="flex gap-2">
        {[{ v: 'offer', l: 'عرض' }, { v: 'request', l: 'طلب' }].map((t) => (
          <label key={t.v} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-primary/25 bg-white p-2.5 text-sm font-bold has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-white">
            <input type="radio" name="adsType" value={t.v} defaultChecked={(initial?.adsType ?? 'offer') === t.v} className="accent-[hsl(var(--primary))]" /> {t.l}
          </label>
        ))}
      </div>

      <Section icon={Tag} title="بيانات الإعلان">
        <div>
          <label className={lbl}>عنوان الإعلان</label>
          <input name="title" required defaultValue={initial?.title} maxLength={255} className={field} placeholder="مثال: رافعة سيزرلفت للإيجار بالدمام" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl}>القسم</label>
            <select name="category_id" value={category} onChange={(e) => setCategory(Number(e.target.value))} className={field}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>التصنيف الفرعي</label>
            <select name="subcategory_id" defaultValue={initial?.subcategoryId ?? ''} className={field}>
              <option value="">— بدون —</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={lbl}>السعر <span className="font-normal text-muted-foreground">(اتركه 0 لـ «على السوم»)</span></label>
          <input name="price" type="number" min="0" step="any" defaultValue={initial?.price ?? 0} className={field} />
        </div>
        <div>
          <label className={lbl}>التفاصيل</label>
          <textarea name="detail" required defaultValue={initial?.detail} rows={6} className="w-full rounded-lg border-2 border-primary/25 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40" placeholder="اكتب وصفاً واضحاً للخدمة أو المنتج..." />
        </div>
      </Section>

      <Section icon={MapPin} title="المدينة والموقع">
        <div>
          <label className={lbl}>الدولة</label>
          <select name="country_id" value={country} onChange={(e) => setCountry(Number(e.target.value))} className={field}>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>المدينة / المنطقة</label>
          <CityCombobox name="city_id" cities={filteredCities} defaultId={initial?.cityId} />
        </div>
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
        </div>
      </Section>

      <Section icon={ImageIcon} title="الصور" hint={initial?.id ? 'أضِف المزيد من الصور (تُضغط تلقائياً للرفع السريع).' : 'حتى 10 صور — تُضغط تلقائياً للرفع السريع.'}>
        <input name="images" type="file" accept="image/*" multiple onChange={onImages} className="w-full rounded-lg border-2 border-primary/25 bg-white p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:font-bold file:text-white" />
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

      <Submit label={submitLabel} />
    </form>
  );
}
