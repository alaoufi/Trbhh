import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, User, Phone, Mail, Save, KeyRound, ShieldCheck, Check, AlertTriangle, Megaphone, Calendar, Wallet, Plus, Minus, Ban, ShieldAlert, Bot, Trash2, Copy, Waves, Flag, ScrollText } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { requireAction } from '@/lib/roles';
import { getBalance, listTxns } from '@/lib/wallet';
import { getModLog, DUP_LIMIT, CONTENT_STRIKE_LIMIT } from '@/lib/moderation';
import { getUserAdminLog } from '@/lib/audit';
import { CATEGORY_LABEL, type GuardCategory } from '@/lib/content-guard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { updateUserAction, sendUserPasswordAction, setUserPasswordAction, adjustUserBalanceAction } from '../../actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'بيانات العضو' };

const KIND_LABEL: Record<string, { label: string; icon: React.ElementType }> = {
  content: { label: 'محتوى ممنوع', icon: ShieldAlert },
  duplicate: { label: 'إعلان مكرر', icon: Copy },
  duplicate_cross: { label: 'مطابق لإعلان عضو آخر', icon: Copy },
  flood: { label: 'إغراق (نشر متسارع)', icon: Waves },
  limit: { label: 'تجاوز حدّ الباقة', icon: Ban },
  report: { label: 'إجراء بلاغ', icon: Flag },
  account: { label: 'حذف حساب', icon: Trash2 },
};

export default async function AdminUserDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; sent?: string; error?: string; setpass?: string; bal?: string }> }) {
  await requireAction('users', 'view');
  const { id } = await params;
  const { saved, sent, error, setpass, bal } = await searchParams;
  const uid = Number(id);
  const [u, adsCount, balance, txns, modLog, adminLog, strikes, dupRow] = await Promise.all([
    prisma.users.findUnique({ where: { id: BigInt(uid) } }).catch(() => null),
    prisma.ads.count({ where: { user_id: BigInt(uid) } }).catch(() => 0),
    getBalance(uid),
    listTxns(uid, 15),
    getModLog(200, uid).catch(() => []),
    getUserAdminLog(uid, 200).catch(() => []),
    prisma.user_strikes.findMany({ where: { user_id: BigInt(uid) } }).catch(() => []),
    prisma.dup_attempts.findUnique({ where: { user_id: BigInt(uid) } }).catch(() => null),
  ]);
  if (!u) notFound();
  const field = 'h-10 w-full rounded-lg border bg-background px-3 text-sm';
  const fmtDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'short', timeStyle: 'short' }).format(d); };

  // عدد مرات الحظر: آلي (mod_log) + يدوي من الإدارة (admin_log) — مصدران منفصلان لا تكرار بينهما
  const autoBanCount = modLog.filter((e) => e.action === 'banned').length;
  const manualBanCount = adminLog.filter((r) => r.action === 'حظر عضو').length;
  const banCount = autoBanCount + manualBanCount;

  // سجل موحّد زمنياً: أحداث الرصد الآلي + قرارات الإدارة اليدوية معاً
  type HistEvent = { id: string; at: string | null; kind: 'mod' | 'admin'; node: React.ReactNode };
  const modEvents: HistEvent[] = modLog.map((e) => {
    const k = KIND_LABEL[e.kind] || { label: e.kind, icon: ShieldAlert };
    const banned = e.action === 'banned';
    const adBanned = e.action === 'ad_banned';
    const accountDeleted = e.action === 'account_deleted';
    const terminal = banned || adBanned || accountDeleted;
    return {
      id: `m${e.id}`, at: e.createdAt, kind: 'mod',
      node: (
        <div key={`m${e.id}`} className={`rounded-lg border p-2.5 text-xs ${terminal ? 'border-red-200 bg-red-50/60' : 'border-border/60 bg-white'}`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <k.icon className={`h-3.5 w-3.5 shrink-0 ${terminal ? 'text-red-600' : 'text-amber-600'}`} />
            <span className="font-bold text-primary">{k.label}</span>
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary"><Bot className="h-3 w-3" /> رصد آلي</span>
            {e.category && <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px]">{CATEGORY_LABEL[e.category as GuardCategory] || e.category}</span>}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${banned ? 'bg-red-600 text-white' : terminal ? 'bg-destructive text-white' : 'bg-amber-200 text-amber-900'}`}>
              {banned ? 'حظر الحساب' : adBanned ? '🚫 حُذف الإعلان نهائياً' : accountDeleted ? '🗑️ حُذف الحساب' : e.action === 'charged' ? 'مسموح (باقة)' : 'رفض/منع'}
            </span>
            {banned && e.reviewedAt && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">رُوجع</span>}
            <span className="mr-auto shrink-0 text-muted-foreground">{fmtDate(e.createdAt)}</span>
          </div>
          {(e.term || e.snippet) && <div className="mt-1 text-muted-foreground">{e.term && <>«{e.term}» </>}{e.snippet}</div>}
          {e.adId && <Link href={`/ads/${e.adId}#admin-tools`} className="mt-1 inline-block font-bold text-primary underline">عرض الإعلان المرتبط #{e.adId} ←</Link>}
        </div>
      ),
    };
  });
  const adminEvents: HistEvent[] = adminLog.map((r) => (
    {
      id: `a${r.id}`, at: r.at, kind: 'admin',
      node: (
        <div key={`a${r.id}`} className="rounded-lg border border-primary/15 bg-primary/5 p-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="font-bold text-primary">{r.action}</span>
            <span className="flex items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">إجراء إداري</span>
            <span className="mr-auto shrink-0 text-muted-foreground">{fmtDate(r.at)}</span>
          </div>
          <div className="mt-1 text-muted-foreground">{r.note && <>«{r.note}» — </>}بواسطة: <b className="text-foreground/80">{r.adminName}</b></div>
        </div>
      ),
    }
  ));
  const timeline = [...modEvents, ...adminEvents].sort((a, b) => (b.at || '').localeCompare(a.at || ''));

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
          {u.ban === 'checked' ? <Badge variant="muted">محظور{u.ban_until ? ` حتى ${fmtDate(u.ban_until.toISOString())}` : ' نهائياً'}</Badge> : <Badge variant="trusted">نشط</Badge>}
          {u.trusted === 1 && <Badge variant="trusted">موثّق</Badge>}
          {u.is_admin === 1 && <Badge>مدير</Badge>}
        </div>
      </div>

      {/* سجل المخالفات: عدد مرات الحظر + الإنذارات النشطة الآن — نظرة سريعة قبل السجل الكامل */}
      <div className="space-y-3 rounded-2xl border-2 border-primary/15 bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-extrabold text-primary"><ScrollText className="h-4 w-4" /> سجل المخالفات</div>
        <div className="grid grid-cols-2 gap-2">
          <Fact icon={Ban} label="مرات الحظر (آلي + يدوي)" value={String(banCount)} />
          <Fact icon={ShieldAlert} label="محاولات تكرار حالية" value={`${dupRow?.count ?? 0}/${DUP_LIMIT}`} />
        </div>
        {strikes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {strikes.filter((s) => s.count > 0).map((s) => (
              <span key={s.kind} className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                {KIND_LABEL[s.kind]?.label || s.kind}: {s.count}/{CONTENT_STRIKE_LIMIT}
              </span>
            ))}
          </div>
        )}
        {timeline.length === 0 ? (
          <p className="rounded-lg bg-secondary/30 p-3 text-center text-xs text-muted-foreground">لا مخالفات ولا إجراءات إدارية مسجّلة لهذا العضو.</p>
        ) : (
          <details>
            <summary className="cursor-pointer text-xs font-bold text-primary">عرض السجل الكامل ({timeline.length}) ▾</summary>
            <div className="mt-2 max-h-96 space-y-1.5 overflow-y-auto">{timeline.map((e) => e.node)}</div>
          </details>
        )}
      </div>

      {/* edit */}
      <form action={updateUserAction} className="space-y-3 rounded-2xl border-2 border-primary/15 bg-card p-4">
        <div className="text-sm font-extrabold text-primary">تعديل البيانات</div>
        <input type="hidden" name="userId" value={uid} />
        <label className="block space-y-1"><span className="flex items-center gap-1 text-sm font-bold"><User className="h-4 w-4" /> الاسم</span><input name="name" defaultValue={u.name || ''} className={field} /></label>
        <label className="block space-y-1"><span className="flex items-center gap-1 text-sm font-bold"><Phone className="h-4 w-4" /> الجوال</span><input name="phoneNumber" defaultValue={u.phoneNumber || ''} dir="ltr" className={field} /></label>
        <label className="block space-y-1"><span className="flex items-center gap-1 text-sm font-bold"><Mail className="h-4 w-4" /> البريد</span><input name="email" defaultValue={u.email || ''} dir="ltr" className={field} /></label>
        <ConfirmSubmit msg="حفظ تعديلات بيانات هذا العضو (الاسم/الجوال/البريد)؟" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90"><Save className="h-4 w-4" /> حفظ التعديلات</ConfirmSubmit>
      </form>

      {/* set password manually — works without SMS */}
      <form action={setUserPasswordAction} className="space-y-3 rounded-2xl border-2 border-primary/15 bg-card p-4">
        <input type="hidden" name="userId" value={uid} />
        <div className="flex items-center gap-2 text-sm font-extrabold text-primary"><KeyRound className="h-4 w-4" /> تعيين كلمة مرور يدوياً</div>
        <p className="text-xs font-bold text-muted-foreground">اكتب كلمة مرور جديدة للعضو مباشرة (بلا رسالة)، ثم أبلغه بها. يحلّ أي مشكلة دخول فوراً.</p>
        <input name="password" type="text" minLength={4} required placeholder="كلمة المرور الجديدة (4 خانات فأكثر)" className={field} />
        <ConfirmSubmit msg="تعيين كلمة المرور المكتوبة لهذا العضو؟ تحلّ محل كلمته الحالية فوراً." className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90"><Save className="h-4 w-4" /> تعيين كلمة المرور</ConfirmSubmit>
      </form>

      {/* send new password via SMS */}
      <form action={sendUserPasswordAction} className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
        <input type="hidden" name="userId" value={uid} />
        <div className="flex items-center gap-2 text-sm font-extrabold text-amber-800"><KeyRound className="h-4 w-4" /> إرسال كلمة مرور جديدة</div>
        <p className="text-xs font-bold text-amber-800">يُنشئ كلمة مرور جديدة للعضو ويرسلها إلى جواله عبر رسالة نصية (يتطلّب ضبط بوابة الرسائل).</p>
        <ConfirmSubmit msg="إنشاء كلمة مرور جديدة وإرسالها لجوال العضو؟ تحلّ محل كلمته الحالية." className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-extrabold text-white hover:bg-amber-700"><KeyRound className="h-4 w-4" /> إرسال كلمة المرور</ConfirmSubmit>
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
            <ConfirmSubmit msg="تأكيد شحن المبلغ المدخل لرصيد هذا العضو؟" name="kind" value="credit" className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"><Plus className="h-4 w-4" /> شحن رصيد</ConfirmSubmit>
            <ConfirmSubmit msg="تأكيد خصم المبلغ المدخل من رصيد هذا العضو؟" name="kind" value="debit" className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-500 px-3 py-2 text-sm font-bold text-white hover:bg-red-600"><Minus className="h-4 w-4" /> خصم</ConfirmSubmit>
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
