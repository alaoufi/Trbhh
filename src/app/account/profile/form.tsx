'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { BadgeCheck } from 'lucide-react';
import { updateProfileAction } from '../actions';
import { Button } from '@/components/ui/button';
import { RegionCityPicker } from '@/components/region-city-picker';

function Save() {
  const { pending } = useFormStatus();
  return <Button disabled={pending}>{pending ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</Button>;
}

type Region = { id: number; name: string };
type Area = { id: number; name: string; cityId: number };
type Initial = {
  name: string; phoneNumber: string; phone_whatsapp: string; allow_phone: boolean; whatsapp: boolean; trusted: boolean;
  regionId: number | null; areaId: number | null;
};

const field = 'h-11 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40';
const lbl = 'mb-1 block text-sm font-bold text-foreground';

export function ProfileForm({ initial, regions, areas }: { initial: Initial; regions: Region[]; areas: Area[] }) {
  const [state, action] = useFormState(updateProfileAction, null as { ok?: boolean; error?: string } | null);
  return (
    <form action={action} className="max-w-lg space-y-4 card-3d rounded-xl p-5">
      {initial.trusted && (
        <div className="flex items-center gap-2 rounded-lg bg-accent p-2 text-sm text-accent-foreground">
          <BadgeCheck className="h-4 w-4" /> حساب موثّق
        </div>
      )}
      <div>
        <label className={lbl}>الاسم</label>
        <input name="name" defaultValue={initial.name} className={field} />
      </div>
      <div>
        <label className={lbl}>رقم الجوال</label>
        <input name="phoneNumber" type="tel" inputMode="tel" defaultValue={initial.phoneNumber} className={field} placeholder="05xxxxxxxx" />
      </div>
      <div>
        <label className={lbl}>رقم الواتساب</label>
        <input name="phone_whatsapp" type="tel" inputMode="tel" defaultValue={initial.phone_whatsapp} className={field} placeholder="9665xxxxxxxx" />
      </div>

      <div className="rounded-lg border-2 border-primary/15 bg-accent/20 p-3">
        <RegionCityPicker regions={regions} areas={areas} initialRegion={initial.regionId} initialArea={initial.areaId} labelClass={lbl} fieldClass={field} />
      </div>

      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="allow_phone" defaultChecked={initial.allow_phone} className="accent-primary" /> إظهار رقم الجوال في إعلاناتي</label>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="whatsapp" defaultChecked={initial.whatsapp} className="accent-primary" /> تفعيل زر الواتساب</label>
      {state?.ok && <p className="text-sm font-bold text-green-600">تم حفظ التغييرات ✓</p>}
      {state?.error && <p className="text-sm font-bold text-destructive">{state.error}</p>}
      <Save />
    </form>
  );
}
