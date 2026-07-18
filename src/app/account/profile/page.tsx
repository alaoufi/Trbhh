import { UserPen } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { getCities, getAreas } from '@/lib/data';
import { getUserArea } from '@/lib/user-location';
import { nameLockEnabled } from '@/lib/settings';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { requestNameChangeAction } from '../actions';
import { ProfileForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الملف الشخصي' };

const field = 'h-11 w-full rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40';

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ namereq?: string }> }) {
  const { namereq } = await searchParams;
  const user = await getCurrentUser();
  const [cities, areas, areaId, nameLocked] = await Promise.all([
    getCities(),
    getAreas(),
    user ? getUserArea(toInt(user.id)) : Promise.resolve(null),
    nameLockEnabled().catch(() => true),
  ]);
  const regions = cities.filter((c) => c.countryId === 1); // السعودية
  // آخر طلب تغيير اسم (لعرض حالته للعضو)
  const lastReq = user && nameLocked
    ? await prisma.name_requests.findFirst({ where: { user_id: user.id }, orderBy: { id: 'desc' } }).catch(() => null)
    : null;
  const NAMEREQ_MSG: Record<string, { cls: string; text: string }> = {
    '1': { cls: 'border-emerald-300 bg-emerald-50 text-emerald-800', text: '✓ أُرسل طلب تغيير الاسم للإدارة — ستصلك رسالة بالنتيجة.' },
    err: { cls: 'border-red-300 bg-red-50 text-red-800', text: 'اكتب اسماً جديداً مختلفاً عن اسمك الحالي.' },
    banned: { cls: 'border-red-300 bg-red-50 text-red-800', text: 'الاسم الجديد يحتوي كلمة غير مسموحة — اختر اسماً آخر.' },
    blocked: { cls: 'border-red-300 bg-red-50 text-red-800', text: '🚫 رُفض الطلب لاحتواء الاسم أو السبب المكتوب على محتوى مخالف.' },
    reason: { cls: 'border-red-300 bg-red-50 text-red-800', text: 'اذكر سبب طلب تغيير الاسم.' },
    doc: { cls: 'border-red-300 bg-red-50 text-red-800', text: 'أرفق مستنداً (صورة أو PDF) يثبت الاسم الجديد — إلزامي.' },
    dup: { cls: 'border-amber-300 bg-amber-50 text-amber-900', text: 'لديك طلب سابق قيد المراجعة — انتظر نتيجته أولاً.' },
  };
  const alertMsg = namereq ? NAMEREQ_MSG[namereq] : null;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الملف الشخصي</h1>
      <p className="text-sm text-muted-foreground">تُحفظ بياناتك (الجوال، الواتساب، المنطقة والمدينة) تلقائياً من إعلاناتك، ويمكنك تعديلها هنا.</p>
      <ProfileForm
        regions={regions}
        areas={areas}
        nameLocked={nameLocked}
        initial={{
          name: user?.name ?? '',
          phoneNumber: user?.phoneNumber ?? '',
          phone_whatsapp: user?.phone_whatsapp ?? '',
          allow_phone: user?.allow_phone === 1,
          whatsapp: user?.whatsapp === 1,
          trusted: user?.trusted === 1,
          regionId: user?.city_id ? toInt(user.city_id) : null,
          areaId: areaId,
        }}
      />

      {/* طلب تغيير الاسم — الاسم لا يتغيّر إلا بموافقة الإدارة مع سبب ومستند إثبات */}
      {nameLocked && (
        <div className="max-w-lg space-y-3 card-3d rounded-xl p-5">
          <div className="flex items-center gap-2 text-sm font-extrabold text-primary"><UserPen className="h-4 w-4" /> طلب تغيير الاسم</div>
          <p className="text-xs font-medium leading-5 text-muted-foreground">
            تغيير الاسم يتم <b>بموافقة الإدارة فقط</b>: اكتب الاسم الجديد وسبب التغيير، وأرفق مستنداً يثبت الاسم
            (هوية/سجل/وثيقة رسمية). ستصلك رسالة بالنتيجة.
          </p>
          {alertMsg && <div className={`rounded-lg border-2 p-3 text-sm font-bold ${alertMsg.cls}`}>{alertMsg.text}</div>}
          {lastReq?.status === 0 && (
            <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">
              ⏳ طلبك قيد مراجعة الإدارة: «{lastReq.old_name}» ← «{lastReq.new_name}» ({timeAgo(lastReq.created_at ? lastReq.created_at.toISOString() : null)}).
            </div>
          )}
          {lastReq?.status === 2 && (
            <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">
              ❌ رُفض طلبك السابق («{lastReq.new_name}»){lastReq.note ? ` — السبب: ${lastReq.note}` : ''}. يمكنك إرسال طلب جديد.
            </div>
          )}
          {lastReq?.status !== 0 && (
            <form action={requestNameChangeAction} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-bold">الاسم الحالي</label>
                <input value={user?.name ?? ''} disabled className={`${field} bg-muted/40 text-muted-foreground`} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold">الاسم الجديد <span className="text-red-600">*</span></label>
                <input name="newName" required maxLength={100} className={field} placeholder="الاسم الجديد كما في المستند" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold">سبب التغيير <span className="text-red-600">*</span></label>
                <textarea name="reason" required rows={2} maxLength={1000} className="w-full rounded-lg border-2 border-primary/25 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" placeholder="مثال: تصحيح الاسم ليطابق الهوية…" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold">مستند يثبت الاسم <span className="text-red-600">*</span></label>
                <input name="doc" type="file" required accept="image/*,application/pdf" className={field} />
              </div>
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">إرسال الطلب للإدارة</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
