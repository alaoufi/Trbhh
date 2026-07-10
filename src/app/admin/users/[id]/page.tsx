import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, User, Phone, Mail, Save, KeyRound, ShieldCheck, Check, AlertTriangle, Megaphone, Calendar, Wallet, Plus, Minus } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { requireAction } from '@/lib/roles';
import { getBalance, listTxns } from '@/lib/wallet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { updateUserAction, sendUserPasswordAction, setUserPasswordAction, adjustUserBalanceAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'بيانات العضو' };

export default async function AdminUserDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; sent?: string; error?: string; setpass?: string; bal?: string }> }) {
  await requireAction('users', 'view');
  const { id } = await params;
  const { saved, sent, error, setpass, bal } = await searchParams;
  const uid = Number(id);
  const [u, adsCount, balance, txns] = await Promise.all([
    prisma.users.findUnique({ where: { id: BigInt(uid) } }).catch(() => null),
    prisma.ads.count({ where: { user_id: BigInt(uid) } }).catch(() => 0),
    getBalance(uid),
    listTxns(uid, 15),
  ]);
  if (!u) notFound();
  const field = 'h-10 w-full rounded-lg border bg-background px-3 text-sm';
  const fmtDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'short', timeStyle: 'short' }).format(d); };

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/admin/users" className="rounded-lg p-2 hover:bg-secondary"><ArrowRight className="h-5 w-5" /></Link>
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-primary"><User className="h-5 w-5" /> {u.name || u.userName || 'عضو'}</h1>
      </div>

      {saved === '1' && <Banner ok>تم حفظ التعديلات.</Banner>}
      {sent === '1' && <Banner ok>تم إرسال كلمة مرور جديدة للعضو عبر رسالة نصية.</Banner>}
      {setpass === '1' && <Banner ok>تم تعيين كلمة المرور. أبلغ العضو بها ليدخل.</Banner>}
      {bal === '1' && <Banner ok>تم تحديث رصيد العضو.</Banner>}
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
        <input name="password" type="text" minLength={4} required placeholder="كلمة المرور الجديدة (4 خانات فأكثر)" className={field} />
        <Button className="gap-2"><Save className="h-4 w-4" /> تعيين كلمة المرور</Button>
      </form>

      {/* send new password via SMS */}
      <form action={sendUserPasswordAction} className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
        <input type="hidden" name="userId" value={uid} />
        <div className="flex items-center gap-2 text-sm font-extrabold text-amber-800"><KeyRound className="h-4 w-4" /> إرسال كلمة مرور جديدة</div>
        <p className="text-xs font-bold text-amber-800">يُنشئ كلمة مرور جديدة للعضو ويرسلها إلى جواله عبر رسالة نصية (يتطلّب ضبط بوابة الرسائل).</p>
        <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-extrabold text-white hover:bg-amber-700"><KeyRound className="h-4 w-4" /> إرسال كلمة المرور</button>
      </form>

      {/* المحفظة / الرصيد */}
      <div className="space-y-3 rounded-2xl border-2 border-primary/15 bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-extrabold text-primary"><Wallet className="h-4 w-4" /> رصيد العضو</div>
          <div className="text-lg font-extrabold text-primary">{balance} ر.س</div>
        </div>
        <form action={adjustUserBalanceAction} className="space-y-2">
          <input type="hidden" name="userId" value={uid} />
          <div className="flex gap-2">
            <input name="amount" type="number" min={1} required placeholder="المبلغ (ر.س)" className={`${field} flex-1`} />
            <input name="note" placeholder="ملاحظة (اختياري)" className={`${field} flex-1`} />
          </div>
          <div className="flex gap-2">
            <button name="kind" value="credit" className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"><Plus className="h-4 w-4" /> شحن رصيد</button>
            <button name="kind" value="debit" className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-500 px-3 py-2 text-sm font-bold text-white hover:bg-red-600"><Minus className="h-4 w-4" /> خصم</button>
          </div>
        </form>
        {txns.length > 0 && (
          <div className="border-t border-primary/10 pt-2">
            <div className="mb-1 text-xs font-bold text-muted-foreground">آخر العمليات</div>
            <ul className="space-y-1">
              {txns.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">{t.label}{t.note ? ` — ${t.note}` : ''}</span>
                  <span className={`shrink-0 font-bold ${t.amount > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{t.amount > 0 ? '+' : ''}{t.amount}</span>
                  <span className="shrink-0 text-muted-foreground">{fmtDate(t.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

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
