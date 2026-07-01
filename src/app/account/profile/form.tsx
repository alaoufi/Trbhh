'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { BadgeCheck } from 'lucide-react';
import { updateProfileAction } from '../actions';
import { Button } from '@/components/ui/button';

function Save() {
  const { pending } = useFormStatus();
  return <Button disabled={pending}>{pending ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</Button>;
}

type Initial = { name: string; phoneNumber: string; phone_whatsapp: string; allow_phone: boolean; whatsapp: boolean; trusted: boolean };

export function ProfileForm({ initial }: { initial: Initial }) {
  const [state, action] = useFormState(updateProfileAction, null as { ok?: boolean } | null);
  return (
    <form action={action} className="max-w-lg space-y-4 card-3d rounded-xl p-5">
      {initial.trusted && (
        <div className="flex items-center gap-2 rounded-lg bg-accent p-2 text-sm text-accent-foreground">
          <BadgeCheck className="h-4 w-4" /> حساب موثّق
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium">الاسم</label>
        <input name="name" defaultValue={initial.name} className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">رقم الجوال</label>
        <input name="phoneNumber" defaultValue={initial.phoneNumber} className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">رقم الواتساب</label>
        <input name="phone_whatsapp" defaultValue={initial.phone_whatsapp} className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allow_phone" defaultChecked={initial.allow_phone} /> إظهار رقم الجوال في إعلاناتي</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="whatsapp" defaultChecked={initial.whatsapp} /> تفعيل زر الواتساب</label>
      {state?.ok && <p className="text-sm text-primary">تم حفظ التغييرات ✓</p>}
      <Save />
    </form>
  );
}
