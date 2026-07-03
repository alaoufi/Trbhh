import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, User, Phone, Mail, Save, KeyRound, ShieldCheck, Check, AlertTriangle, Megaphone, Calendar } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { requireAction } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { updateUserAction, sendUserPasswordAction, setUserPasswordAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'بيانات العضو' };

export default async function AdminUserDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; sent?: string; error?: string; setpass?: string }> }) {
  await requireAction('users', 'view');
  const { id } = await params;
  const { saved, sent, error, setpass } = await searchParams;
  const uid = Number(id);
  const [u, adsCount] = await Promise.all([
    prisma.users.findUnique({ where: { id: BigInt(uid) } }).catch(() => null),
    prisma.ads.count({ where: { user_id: BigInt(uid) } }).catch(() => 0),
  ]);
  if (!u) notFound();
  const field = 'h-10 w-full rounded-lg border bg-background px-3 text-sm';

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/admin/users" className="rounded-lg p-2 hover:bg-secondary"><ArrowRight className="h-5 w-5" /></Link>
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-primary"><User className="h-5 w-5" /> {u.name || u.userName || 'عضو'}</h1>
      </div>

      {saved === '1' && <Banner ok>تم حفظ التعديلات.</Banner>}
      {sent === '1' && <Banner ok>تم إرسال كلمة مرور جديدة للعضو عبر رسالة نصية.</Banner>}
      {setpass === '1' && <Banner ok>تم تعيين كلمة المرور. أبلغ العضو بها ليدخل.</Banner>}
      {error && <Banner>{decodeURIComponent(error)}</Banner>}

      {/* quick facts */}
      <div className="grid grid-cols-2 gap-2">
        <Fact icon={Megaphone} label="عدد الإعلانات" value={String(adsCount)} />
        <Fact icon={Calendar} label="تاريخ التسجيل" value={timeAgo(u.created_at)} />
        <div className="col-span-2 flex items-center gap-2">
          {u.ban === 'checked' ? <Badge variant="muted">محظور</Badge> : <Badge variant="trusted">نشط</Badge>}
          {u.trusted === 1 && <Badge variant="trusted">موثّق</Badge>}
          {u.is_admin === 1 && <Badge>مدير</Badge>}
        </div>
      </div>

      {/* edit */}
      <form action={updateUserAction} className="space-y-3 rounded-2xl border-2 border-primary/15 bg-card p-4">
        <div className="text-sm font-extrabold text-primary">تعديل البيانات</div>
        <input type="hidden" name="userId" value={uid} />
        <label className="block space-y-1"><span className="flex items-center gap-1 text-sm font-bold"><User className="h-4 w-4" /> الاسم</span><input name="name" defaultValue={u.name || ''} className={field} /></label>
        <label className="block space-y-1"><span className="flex items-center gap-1 text-sm font-bold"><Phone className="h-4 w-4" /> الجوال</span><input name="phoneNumber" defaultValue={u.phoneNumber || ''} dir="ltr" className={field} /></label>
        <label className="block space-y-1"><span className="flex items-center gap-1 text-sm font-bold"><Mail className="h-4 w-4" /> البريد</span><input name="email" defaultValue={u.email || ''} dir="ltr" className={field} /></label>
        <Button className="gap-2"><Save className="h-4 w-4" /> حفظ التعديلات</Button>
      </form>

      {/* set password manually — works without SMS */}
      <form action={setUserPasswordAction} className="space-y-3 rounded-2xl border-2 border-primary/15 bg-card p-4">
        <input type="hidden" name="userId" value={uid} />
        <div className="flex items-center gap-2 text-sm font-extrabold text-primary"><KeyRound className="h-4 w-4" /> تعيين كلمة مرور يدوياً</div>
        <p className="text-xs font-bold text-muted-foreground">اكتب كلمة مرور جديدة للعضو مباشرة (بلا رسالة)، ثم أبلغه بها. يحلّ أي مشكلة دخول فوراً.</p>
        <input name="password" type="text" minLength={6} required placeholder="كلمة المرور الجديدة (6 أحرف فأكثر)" className={field} />
        <Button className="gap-2"><Save className="h-4 w-4" /> تعيين كلمة المرور</Button>
      </form>

      {/* send new password via SMS */}
      <form action={sendUserPasswordAction} className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
        <input type="hidden" name="userId" value={uid} />
        <div className="flex items-center gap-2 text-sm font-extrabold text-amber-800"><KeyRound className="h-4 w-4" /> إرسال كلمة مرور جديدة</div>
        <p className="text-xs font-bold text-amber-800">يُنشئ كلمة مرور جديدة للعضو ويرسلها إلى جواله عبر رسالة نصية (يتطلّب ضبط بوابة الرسائل).</p>
        <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-extrabold text-white hover:bg-amber-700"><KeyRound className="h-4 w-4" /> إرسال كلمة المرور</button>
      </form>

      <Link href={`/admin/users/${uid}/permissions`} className="inline-flex items-center gap-1 rounded-lg border border-primary/30 px-3 py-2 text-sm font-bold text-primary hover:bg-accent">
        <ShieldCheck className="h-4 w-4" /> إدارة الصلاحيات
      </Link>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border-2 border-primary/15 bg-white p-3">
      <Icon className="h-5 w-5 text-primary" />
      <div><div className="text-sm font-extrabold text-primary">{value}</div><div className="text-[11px] font-bold text-muted-foreground">{label}</div></div>
    </div>
  );
}

function Banner({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border-2 p-3 text-sm font-bold ${ok ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'}`}>
      {ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}<span>{children}</span>
    </div>
  );
}
