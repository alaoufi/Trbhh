import { getCurrentUser } from '@/lib/auth';
import { BadgeCheck, ShieldCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { submitVerificationAction } from './actions';

export const metadata = { title: 'توثيق الحساب' };

export default async function VerifyPage() {
  const user = await getCurrentUser();
  const field = 'w-full rounded-lg border bg-background p-2 text-sm';

  if (user?.trusted === 1) {
    return (
      <div className="rounded-xl border border-primary/30 bg-accent p-8 text-center">
        <BadgeCheck className="mx-auto mb-2 h-10 w-10 text-primary" />
        <h1 className="text-lg font-bold">حسابك موثّق ✓</h1>
        <p className="text-sm text-accent-foreground">تتمتع بعلامة موثّق وأولوية بالظهور وإحصائيات متقدمة.</p>
      </div>
    );
  }

  const pending = (user?.step ?? 0) > 0;
  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /><h1 className="text-xl font-bold">توثيق الحساب</h1></div>
      {pending && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Clock className="h-4 w-4" /> طلب التوثيق قيد المراجعة من الإدارة.
        </div>
      )}
      <p className="text-sm text-muted-foreground">ارفع وثائقك الرسمية ليقوم فريق الإدارة بمراجعتها ومنحك علامة التوثيق.</p>
      <form action={submitVerificationAction} className="space-y-4 card-3d rounded-xl p-5">
        <div><label className="mb-1 block text-sm font-medium">الهوية الوطنية</label><input name="national_identity" type="file" accept="image/*,application/pdf" className={field} /></div>
        <div><label className="mb-1 block text-sm font-medium">السجل التجاري (للشركات)</label><input name="commercial_register" type="file" accept="image/*,application/pdf" className={field} /></div>
        <div><label className="mb-1 block text-sm font-medium">تصريح العمل (اختياري)</label><input name="work_permit" type="file" accept="image/*,application/pdf" className={field} /></div>
        <Button>إرسال طلب التوثيق</Button>
      </form>
    </div>
  );
}
