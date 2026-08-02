import { CalendarClock } from 'lucide-react';
import { requestViewingAction } from '@/app/ads/viewing-actions';

/**
 * بطاقة «اطلب معاينة هذا العقار» — تربط المهتمّ بصاحب العقار/الوسيط (جوهر الوساطة).
 * متاحة للزائر والعضو. تُعبّأ باسم/جوال العضو إن كان مسجّلاً.
 */
export function ViewingRequestCard({
  adId,
  defaultName = '',
  defaultPhone = '',
  done = false,
  error = false,
}: {
  adId: number;
  defaultName?: string;
  defaultPhone?: string;
  done?: boolean;
  error?: boolean;
}) {
  const field = 'h-10 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40';
  return (
    <div id="viewing" className="card-3d scroll-mt-20 rounded-2xl p-4">
      <h3 className="mb-1 flex items-center gap-2 text-base font-extrabold text-primary">
        <CalendarClock className="h-5 w-5" /> اطلب معاينة هذا العقار
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">يصل طلبك مباشرةً لصاحب العقار/الوسيط، ويتواصل معك لترتيب موعد المعاينة.</p>
      {done && (
        <div className="mb-3 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-2.5 text-sm font-bold text-emerald-800">
          ✅ تم إرسال طلب المعاينة — سيتواصل معك صاحب العقار قريباً.
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-lg border-2 border-red-300 bg-red-50 p-2.5 text-sm font-bold text-red-800">
          أدخل الاسم ورقم جوال صحيح لإرسال الطلب.
        </div>
      )}
      <form action={requestViewingAction} className="space-y-2.5">
        <input type="hidden" name="adId" value={adId} />
        <div className="grid gap-2.5 sm:grid-cols-2">
          <input name="name" defaultValue={defaultName} required maxLength={120} className={field} placeholder="الاسم" />
          <input name="phone" defaultValue={defaultPhone} required maxLength={30} dir="ltr" className={field} placeholder="رقم الجوال" />
        </div>
        <input name="preferred" maxLength={60} className={field} placeholder="الوقت المفضّل للمعاينة (مثال: غداً بعد العصر)" />
        <textarea name="message" maxLength={500} rows={3} className="w-full rounded-lg border-2 border-primary/25 bg-white p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40" placeholder="ملاحظة (اختياري)" />
        <button className="h-11 w-full rounded-lg bg-primary text-sm font-extrabold text-white transition hover:opacity-90">
          إرسال طلب المعاينة
        </button>
      </form>
    </div>
  );
}
