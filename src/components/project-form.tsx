'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Building2, MapPin } from 'lucide-react';
import { PROJECT_TYPES } from '@/lib/realestate-types';
import { createProjectAction } from '@/app/projects/actions';

const MapPicker = dynamic(() => import('./map-picker').then((m) => m.MapPicker), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-secondary" />,
});

type City = { id: number; name: string };

export function ProjectForm({ cities }: { cities: City[] }) {
  const [geo, setGeo] = useState<{ lat: string; lng: string } | null>(null);
  const field = 'h-10 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40';
  const lbl = 'mb-1 block text-[13px] font-bold text-foreground';

  return (
    <form action={createProjectAction} className="space-y-3">
      <div className="overflow-hidden rounded-xl border-2 border-primary/20 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b-2 border-primary/20 bg-primary/10 px-4 py-2.5">
          <Building2 className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-extrabold text-primary">بيانات المشروع</h3>
        </div>
        <div className="space-y-2.5 p-3.5">
          <div>
            <label className={lbl}>اسم المشروع</label>
            <input name="name" required maxLength={160} className={field} placeholder="مثال: مشروع واحة النرجس السكني" />
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div>
              <label className={lbl}>نوع المشروع</label>
              <select name="ptype" defaultValue="" className={field}>
                <option value="">— اختر —</option>
                {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>المدينة</label>
              <select name="city_id" defaultValue="" className={field}>
                <option value="">— اختر —</option>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <div>
              <label className={lbl}>الحي</label>
              <input name="district" maxLength={120} className={field} placeholder="مثال: النرجس" />
            </div>
            <div>
              <label className={lbl}>عدد الوحدات</label>
              <input name="units" type="number" min="0" className={field} placeholder="مثال: 120" />
            </div>
            <div>
              <label className={lbl}>يبدأ السعر من (ر.س)</label>
              <input name="price_from" type="number" min="0" className={field} placeholder="مثال: 850000" />
            </div>
          </div>
          <div>
            <label className={lbl}>موعد التسليم</label>
            <input name="delivery" maxLength={40} className={field} placeholder="مثال: الربع الأول 2027" />
          </div>
          <div>
            <label className={lbl}>وصف المشروع</label>
            <textarea name="description" rows={5} maxLength={4000} className="w-full rounded-lg border-2 border-primary/25 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40" placeholder="المميزات، الموقع، المرافق، أنواع الوحدات..." />
          </div>
          <div>
            <label className={lbl}>صورة الغلاف (اختياري)</label>
            <input name="cover" type="file" accept="image/*" className="block w-full text-xs" />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border-2 border-primary/20 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b-2 border-primary/20 bg-primary/10 px-4 py-2.5">
          <MapPin className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-extrabold text-primary">موقع المشروع</h3>
        </div>
        <div className="space-y-2 p-3.5">
          <input type="hidden" name="lat" value={geo?.lat || ''} />
          <input type="hidden" name="lng" value={geo?.lng || ''} />
          <MapPicker
            lat={geo ? Number(geo.lat) : null}
            lng={geo ? Number(geo.lng) : null}
            onChange={(lat, lng) => setGeo({ lat: String(lat), lng: String(lng) })}
          />
          <p className="text-[11px] text-muted-foreground">اضغط على الخريطة أو اسحب الدبّوس لتحديد موقع المشروع.</p>
        </div>
      </div>

      <button className="h-11 w-full rounded-lg bg-primary text-sm font-extrabold text-white transition hover:opacity-90">
        نشر المشروع (يخضع لاعتماد الإدارة)
      </button>
    </form>
  );
}
