'use client';
import { useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

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
  action, categories, subcategories, countries, cities, initial, submitLabel, error,
}: {
  action: (fd: FormData) => void | Promise<void>;
  categories: Cat[]; subcategories: Sub[]; countries: Country[]; cities: City[];
  initial?: Initial; submitLabel: string; error?: string;
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

  const field = 'h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';

  return (
    <form action={action} className="max-w-2xl space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      {initial?.id && <input type="hidden" name="adId" value={initial.id} />}

      {error === 'contact' && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          يجب إدخال رقم الجوال أو الواتساب قبل نشر الإعلان.
        </div>
      )}

      <div className="flex gap-2">
        {[{ v: 'offer', l: 'عرض' }, { v: 'request', l: 'طلب' }].map((t) => (
          <label key={t.v} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border p-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
            <input type="radio" name="adsType" value={t.v} defaultChecked={(initial?.adsType ?? 'offer') === t.v} className="accent-[hsl(var(--primary))]" /> {t.l}
          </label>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">عنوان الإعلان</label>
        <input name="title" required defaultValue={initial?.title} maxLength={255} className={field} placeholder="مثال: رافعة سيزرلفت للإيجار بالدمام" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">القسم</label>
          <select name="category_id" value={category} onChange={(e) => setCategory(Number(e.target.value))} className={field}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">التصنيف الفرعي</label>
          <select name="subcategory_id" defaultValue={initial?.subcategoryId ?? ''} className={field}>
            <option value="">— بدون —</option>
            {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">الدولة</label>
          <select name="country_id" value={country} onChange={(e) => setCountry(Number(e.target.value))} className={field}>
            {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">المدينة</label>
          <select name="city_id" defaultValue={initial?.cityId ?? ''} className={field}>
            <option value="">— اختر —</option>
            {filteredCities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">السعر (اتركه 0 لـ «على السوم»)</label>
        <input name="price" type="number" min="0" step="any" defaultValue={initial?.price ?? 0} className={field} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">التفاصيل</label>
        <textarea name="detail" required defaultValue={initial?.detail} rows={6} className="w-full rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="اكتب وصفاً واضحاً للخدمة أو المنتج..." />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">الصور {initial?.id ? '(إضافة المزيد)' : '(حتى 10 صور)'}</label>
        <input name="images" type="file" accept="image/*" multiple className="w-full rounded-lg border bg-background p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1" />
      </div>

      <div className="rounded-lg border border-primary/20 bg-accent/40 p-3">
        <p className="mb-2 text-sm font-semibold text-primary">موقع الإعلان <span className="text-muted-foreground">(اختياري)</span></p>
        <p className="mb-3 text-xs text-muted-foreground">حدّد موقع الإعلان لعرض المسافة للباحثين القريبين منك.</p>
        <input type="hidden" name="lat" value={geo?.lat ?? ''} />
        <input type="hidden" name="lng" value={geo?.lng ?? ''} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={useMyLocation} disabled={geoBusy} className="flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm text-primary disabled:opacity-60">
            {geoBusy ? 'جارٍ تحديد الموقع...' : 'استخدم موقعي الحالي'}
          </button>
          {geo && <span className="text-xs text-green-700">✓ تم تحديد الموقع</span>}
          {geo && <button type="button" onClick={() => setGeo(null)} className="text-xs text-red-600 hover:underline">إزالة</button>}
        </div>
      </div>

      <div className="rounded-lg border border-primary/20 bg-accent/40 p-3">
        <p className="mb-2 text-sm font-semibold text-primary">وسيلة التواصل <span className="text-red-600">*</span></p>
        <p className="mb-3 text-xs text-muted-foreground">يجب إدخال رقم الجوال أو الواتساب على الأقل حتى يتمكن العملاء من التواصل معك.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">رقم الجوال</label>
            <input name="phone" type="tel" inputMode="tel" defaultValue={initial?.phone ?? ''} maxLength={20} className={field} placeholder="05xxxxxxxx" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">رقم الواتساب</label>
            <input name="whatsapp" type="tel" inputMode="tel" defaultValue={initial?.whatsapp ?? ''} maxLength={20} className={field} placeholder="9665xxxxxxxx" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="phoneAllow" defaultChecked={initial?.phoneAllow ?? true} /> إظهار رقم الجوال</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="commentAllow" defaultChecked={initial?.commentAllow ?? true} /> السماح بالتعليقات</label>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        بنشر الإعلان أنت تقرّ أن التعامل والدفع يتمّان خارج المنصة، وأن المنصة وسيلة عرض وربط فقط.
      </div>

      <Submit label={submitLabel} />
    </form>
  );
}
