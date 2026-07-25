import Image from 'next/image';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { UserRound, Store, Check, Pencil, Trash2, Plus, Star, Link2, ShieldAlert, MessageSquare, KeyRound, Sparkles, ShieldCheck, Crown } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUserProfiles, getActiveProfile, PROFILES_INTRO_COOKIE, type Profile } from '@/lib/profiles';
import { getMemberIdentitySub, getIdentityPlans, planPrice, DURATION_LABEL, type IdentityDuration } from '@/lib/identity-plans';
import { getMergeCandidates } from '@/lib/account-merge';
import { linkedAccounts } from '@/lib/account-links';
import { getBalance } from '@/lib/wallet';
import { IDENTITY_THEMES } from '@/lib/identity-themes';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { switchAccountAction } from '@/app/account/actions';
import { addProfileAction, updateProfileAction, deleteProfileAction, switchProfileAction, linkAccountAction, startLinkOtpAction, confirmLinkOtpAction, dismissProfilesIntroAction, startPrimaryVerifyAction, confirmPrimaryVerifyAction, subscribeIdentityAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الحسابات الموحدة — حسابات ومتاجر' };

const field = 'w-full rounded-lg border-2 border-primary/25 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-primary/40';
const lbl = 'mb-1 block text-xs font-bold text-foreground/70';

function ProfileForm({ p }: { p?: Profile }) {
  const edit = !!p;
  return (
    <form action={edit ? updateProfileAction : addProfileAction} encType="multipart/form-data" className="space-y-3">
      {edit && <input type="hidden" name="profileId" value={p!.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={lbl}>الاسم الظاهر <span className="text-red-600">*</span></label>
          <input name="name" required defaultValue={p?.name || ''} maxLength={120} className={field} placeholder="مثال: أبو محمد / مؤسسة النور" />
        </div>
        <div>
          <label className={lbl}>المعرّف الظاهر (اختياري)</label>
          <input name="handle" defaultValue={p?.handle || ''} maxLength={32} className={field} placeholder="مثال: abu_mohammed" dir="ltr" />
        </div>
        <div>
          <label className={lbl}>جوال المراسلات</label>
          <input name="phone" type="tel" inputMode="tel" defaultValue={p?.phone || ''} maxLength={24} className={field} placeholder="05xxxxxxxx" dir="ltr" />
        </div>
        <div>
          <label className={lbl}>واتساب المراسلات</label>
          <input name="whatsapp" type="tel" inputMode="tel" defaultValue={p?.whatsapp || ''} maxLength={24} className={field} placeholder="05xxxxxxxx" dir="ltr" />
        </div>
        <div>
          <label className={lbl}>بريد المراسلات</label>
          <input name="email" type="email" defaultValue={p?.email || ''} maxLength={120} className={field} placeholder="name@example.com" dir="ltr" />
        </div>
        <div>
          <label className={lbl}>الصورة التعريفية</label>
          <input name="avatar" type="file" accept="image/*" className="w-full rounded-lg border-2 border-primary/25 bg-white p-1.5 text-xs file:mr-2 file:rounded file:border-0 file:bg-primary file:px-2 file:py-1 file:font-bold file:text-white" />
        </div>
      </div>
      <div>
        <label className={lbl}>قالب الهوية (لون الموقع عند تفعيلها — للتفريق بينها)</label>
        <div className="flex flex-wrap items-center gap-2">
          {IDENTITY_THEMES.map((t) => (
            <label key={t.key} className="relative cursor-pointer" title={t.name}>
              <input type="radio" name="theme" value={t.key} defaultChecked={(p?.theme || '') === t.key} className="peer sr-only" />
              <span className="flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ring-2 ring-transparent peer-checked:ring-foreground" style={{ borderColor: t.hex, color: t.hex }}>
                <span className="h-3.5 w-3.5 rounded-full" style={{ background: t.hex }} /> {t.name}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">عند تفعيل هذه الهوية يتغيّر قالب الموقع للونها لتعرف بأي هوية تعمل.</p>
      </div>
      <button className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-white hover:opacity-90">
        {edit ? <><Check className="h-4 w-4" /> حفظ التعديلات</> : <><Plus className="h-4 w-4" /> إضافة الهوية</>}
      </button>
    </form>
  );
}

export default async function ProfilesPage({ searchParams }: { searchParams: Promise<{ error?: string; max?: string; added?: string; saved?: string; deleted?: string; merror?: string; linked?: string; lname?: string; motp?: string; mident?: string; mmask?: string; omsg?: string; potp?: string; pverified?: string; perror?: string; idsubbed?: string; idexpired?: string; iderror?: string; price?: string; bal?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;
  const [profiles, active, candidates, linked, me, balance, cookieStore] = await Promise.all([
    getUserProfiles(session.uid), getActiveProfile(session.uid), getMergeCandidates(session.uid).catch(() => []),
    linkedAccounts(session.uid).catch(() => []),
    prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { name: true, userName: true, phoneNumber: true, primary_verified: true } }).catch(() => null),
    getBalance(session.uid).catch(() => 0),
    cookies(),
  ]);
  const [memberSub, plans] = await Promise.all([getMemberIdentitySub(session.uid).catch(() => null), getIdentityPlans().catch(() => [])]);
  const otpStage = sp.motp === '1';
  const mIdent = sp.mident || '';
  const showIntro = cookieStore.get(PROFILES_INTRO_COOKIE)?.value !== '1';
  const otherLinked = linked.filter((a) => a.id !== session.uid);
  const primaryVerified = (me?.primary_verified ?? 0) === 1;
  const pOtpStage = sp.potp === '1';
  const paidOn = !!memberSub?.featurePaid;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <UserRound className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">الحسابات الموحدة — دخول واحد لكل حساباتك</h1>
      </div>

      {/* رسالة تعريفية موجزة — أول مرة فقط */}
      {showIntro && (
        <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
          <div className="mb-1 flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><h2 className="text-sm font-extrabold text-primary">دخول واحد يدير كل حساباتك ومتاجرك</h2></div>
          <p className="text-xs leading-6 text-foreground/80">
            وثّق حسابك الرئيسي مرة واحدة، ثم اربط حساباتك الأخرى (برمز يصل لكل رقم) أو أضِف هويات ومتاجر جديدة باسمها وأيقونتها.
            بدّل الهوية الفعّالة قبل النشر لتُعلن باسمها. كل حساب يبقى مستقلاً، والجوال للمراسلات فقط (يجوز تكراره).
          </p>
          <form action={dismissProfilesIntroAction} className="mt-2">
            <button className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-1.5 text-xs font-extrabold text-white hover:opacity-90"><Check className="h-3.5 w-3.5" /> فهمت، ابدأ</button>
          </form>
        </div>
      )}

      {sp.error === 'limit' && <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">بلغت الحد الأقصى لعدد الهويات الشخصية{sp.max ? ` (${sp.max})` : ''}.</div>}
      {sp.error === 'handle' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">المعرّف الظاهر مستخدم مسبقاً — اختر غيره.</div>}
      {sp.error === 'name' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">الاسم الظاهر مطلوب.</div>}
      {(sp.added || sp.saved || sp.deleted) && <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ تم الحفظ.</div>}
      {sp.linked && <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ تم ربط الحساب{sp.lname ? ` «${sp.lname}»` : ''} بحسابك — يبقى مستقلاً بإعلاناته ورسائله ورصيده، وتقدر تتنقّل إليه من قائمة «حساباتي المرتبطة» أدناه.</div>}
      {sp.merror === 'creds' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">أكمل بيانات الحساب الآخر.</div>}
      {sp.merror === 'verify' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">بيانات دخول الحساب الآخر غير صحيحة.</div>}
      {sp.merror === 'badcode' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">رمز التحقق غير صحيح أو منتهي — أعد الإرسال وحاول مجدداً.</div>}
      {sp.merror === 'notfound' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">هذا الرقم غير مسجّل في المنصة — تأكّد من الرقم، أو استخدم «إضافة هوية جديدة» بدل ربط حساب موجود.</div>}
      {sp.merror === 'nophone' && <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">هذا الحساب بلا رقم جوال مسجّل — استخدم «التحقق بكلمة المرور» بدل الرمز.</div>}
      {sp.merror === 'otp' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">تعذّر إرسال الرمز{sp.omsg ? `: ${sp.omsg}` : ''}.</div>}
      {sp.merror === 'self' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">هذا هو حسابك الحالي — أدخل حساباً آخر تريد ربطه.</div>}
      {sp.merror === 'admin' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">لا يمكن ربط حساب إداري.</div>}
      {(sp.merror === 'alreadymerged' || sp.merror === 'othergroup') && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">هذا الحساب مرتبط بمجموعة أخرى — فُكّ ارتباطه أولاً أو راجع الإدارة.</div>}
      {sp.merror && !['creds', 'verify', 'badcode', 'notfound', 'nophone', 'otp', 'self', 'admin', 'alreadymerged', 'othergroup'].includes(sp.merror) && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">تعذّر ربط الحساب — حاول لاحقاً.</div>}
      {sp.pverified && <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ تم التحقق من حسابك الرئيسي.</div>}
      {sp.idsubbed && <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ تم تفعيل/تجديد اشتراك الباقة.</div>}
      {sp.idexpired && <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">النشر بهوية إضافية يتطلّب اشتراكاً سارياً — اشترك بباقة أدناه، أو بدّل للحساب الرئيسي (مجاني) من الشريط أعلى الصفحة.</div>}
      {sp.error === 'needsub' && <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">لإضافة هوية جديدة اشترك بباقة أدناه (الحساب الرئيسي مجاني).</div>}
      {sp.iderror === 'nocredit' && <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">رصيدك لا يكفي للاشتراك{sp.price ? ` (المطلوب ${sp.price} ر.س)` : ''} — <Link href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك</Link> ثم أعد المحاولة.</div>}
      {sp.iderror && sp.iderror !== 'nocredit' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">تعذّر تنفيذ الاشتراك — حاول لاحقاً.</div>}
      {sp.perror === 'badcode' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">رمز التحقق غير صحيح أو منتهي — أعد المحاولة.</div>}
      {sp.perror === 'nophone' && <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">لا يوجد رقم جوال في حسابك الرئيسي — أضِفه من الملف الشخصي أولاً.</div>}
      {sp.perror === 'otp' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">تعذّر إرسال الرمز{sp.omsg ? `: ${sp.omsg}` : ''}.</div>}

      {/* ١) الحساب الرئيسي — الدخول والتوثيق */}
      <div id="main" className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-bold text-muted-foreground">حسابك الرئيسي (الدخول لكل حساباتك)</div>
            <div className="truncate font-extrabold">{me?.name || me?.userName || 'حسابي'}</div>
            {me?.phoneNumber && <div className="text-xs text-muted-foreground" dir="ltr">{me.phoneNumber}</div>}
          </div>
          {primaryVerified
            ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-extrabold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> تم التحقق</span>
            : <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-700"><ShieldAlert className="h-3.5 w-3.5" /> غير موثّق</span>}
        </div>
        {!primaryVerified && (
          pOtpStage ? (
            <form action={confirmPrimaryVerifyAction} className="mt-3 flex flex-wrap items-end gap-2">
              <div>
                <label className={lbl}>رمز التحقق الواصل لجوالك</label>
                <input name="code" required inputMode="numeric" maxLength={4} className={`${field} w-40`} placeholder="____" dir="ltr" autoComplete="one-time-code" />
              </div>
              <button className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-white hover:opacity-90"><Check className="h-4 w-4" /> تأكيد</button>
            </form>
          ) : (
            <form action={startPrimaryVerifyAction} className="mt-3">
              <button className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-white hover:opacity-90"><MessageSquare className="h-4 w-4" /> تحقّق برمز SMS</button>
              <p className="mt-1 text-[11px] text-muted-foreground">وثّق حسابك الرئيسي مرة واحدة قبل ربط بقية حساباتك.</p>
            </form>
          )
        )}
      </div>

      {/* الهوية الفعّالة */}
      <div className="rounded-2xl border-2 p-4" style={{ borderColor: active.color || 'hsl(var(--primary))', background: `${active.color || '#3287da'}14` }}>
        <div className="text-xs font-bold text-muted-foreground">الهوية الفعّالة الآن — تُعلن باسم:</div>
        <div className="mt-1 flex items-center gap-3">
          <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2" style={{ '--tw-ring-color': active.color || '#3287da' } as React.CSSProperties}>
            <Image src={active.avatarUrl} alt={active.name} fill sizes="48px" className="object-cover" />
          </span>
          <div>
            <div className="flex items-center gap-1.5 font-extrabold" style={{ color: active.color || undefined }}>
              {active.type === 'store' ? <Store className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
              {active.name}
              {active.isDefault && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">افتراضي</span>}
            </div>
            {active.handle && <div className="text-xs text-muted-foreground" dir="ltr">@{active.handle}</div>}
          </div>
        </div>
      </div>

      {/* قائمة الهويات */}
      <div className="space-y-3">
        <h2 className="text-sm font-extrabold text-foreground/80">كل هوياتك ({profiles.length})</h2>
        {profiles.map((p) => (
          <div key={p.id} id={`id-${p.id}`} className="card-3d rounded-xl p-3" style={{ borderInlineStart: `4px solid ${p.color || '#cbd5e1'}` }}>
            <div className="flex items-center gap-3">
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted">
                <Image src={p.avatarUrl} alt={p.name} fill sizes="44px" className="object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-bold">
                  {p.type === 'store' ? <Store className="h-4 w-4 text-primary" /> : <UserRound className="h-4 w-4 text-primary" />}
                  <span className="truncate">{p.name}</span>
                  {p.isDefault && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                  {active.id === p.id && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">فعّالة</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.type === 'store' ? 'متجر' : 'حساب شخصي'}
                  {p.phone ? ` • 📱 ${p.phone}` : ''}{p.handle ? ` • @${p.handle}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {active.id !== p.id && (
                  <form action={switchProfileAction}>
                    <input type="hidden" name="profileId" value={p.id} />
                    <input type="hidden" name="back" value="/account/profiles" />
                    <button className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-white hover:opacity-90"><Check className="h-3 w-3" /> تفعيل</button>
                  </form>
                )}
              </div>
            </div>
            {/* تعديل الهوية الشخصية (المتجر يُعدّل من إعدادات متجره) */}
            {p.type === 'personal' ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-bold text-primary"><Pencil className="mb-0.5 inline h-3 w-3" /> تعديل بيانات هذه الهوية</summary>
                <div className="mt-3 rounded-lg border border-primary/15 bg-primary/5 p-3">
                  <ProfileForm p={p} />
                  {!p.isDefault && (
                    <form action={deleteProfileAction} className="mt-3 border-t pt-2">
                      <input type="hidden" name="profileId" value={p.id} />
                      <ConfirmSubmit msg={`حذف الهوية «${p.name}»؟ إعلاناتها المنشورة تبقى كما هي.`} className="flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1 text-xs font-bold text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3 w-3" /> حذف الهوية
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>
              </details>
            ) : (
              <div className="mt-2 text-xs text-muted-foreground">
                تُعدّل بيانات المتجر (الاسم/الشعار/التواصل) من <Link href="/store" className="font-bold text-primary underline">إدارة المتجر</Link>.
              </div>
            )}
          </div>
        ))}
      </div>

      {/* باقات الهويات (تظهر عند تفعيل التسعير من الإدارة) */}
      {paidOn && (
        <div id="packages" className="card-3d rounded-2xl border-2 border-amber-300 p-4">
          <h2 className="mb-1 flex items-center gap-1 text-sm font-extrabold text-amber-700"><Crown className="h-4 w-4" /> باقات الهويات (الرئيسي مجاني)</h2>
          <p className="mb-2 text-[11px] text-muted-foreground">الباقات على الحسابات الشخصية فقط. <b>المتاجر مشمولة باشتراكها الشهري المستقل — لا رسوم إضافية عليها هنا.</b></p>
          {memberSub?.paid
            ? <p className="mb-3 text-xs font-bold text-emerald-700">✓ مشترك بباقة «{memberSub.planName}» — {memberSub.slots >= 999 ? 'غير محدود' : memberSub.slots} هوية، حتى {String(memberSub.until).slice(0, 10)}.</p>
            : memberSub?.exemptActive
              ? <p className="mb-3 text-xs font-bold text-primary">🎁 إعفاء مجاني حتى {String(memberSub.exemptUntil).slice(0, 10)} — بعدها اشترك بباقة للاستمرار.</p>
              : <p className="mb-3 text-xs text-muted-foreground">اشترك بباقة لإضافة هويات نشر والاستمرار بها (الحساب الرئيسي مجاني دائماً).</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            {plans.filter((pl) => pl.accounts > 0).map((pl) => (
              <div key={pl.idx} className="rounded-xl border-2 border-amber-200 bg-amber-50/40 p-3">
                <div className="flex items-center gap-1 font-extrabold text-amber-800"><Crown className="h-3.5 w-3.5" /> {pl.name}</div>
                <div className="mb-2 text-xs text-muted-foreground">{pl.accounts} هوية إضافية</div>
                <div className="space-y-1.5">
                  {(['month', 'half', 'year'] as IdentityDuration[]).map((d) => {
                    const price = planPrice(pl, d);
                    if (price <= 0) return null;
                    return balance >= price ? (
                      <form key={d} action={subscribeIdentityAction}>
                        <input type="hidden" name="plan" value={pl.idx} />
                        <input type="hidden" name="dur" value={d} />
                        <ConfirmSubmit msg={`اشتراك باقة «${pl.name}» (${DURATION_LABEL[d]}) بعدد ${pl.accounts} هوية مقابل ${price} ر.س من رصيدك؟`} className="flex w-full items-center justify-between rounded-md bg-amber-600 px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90">
                          <span>{DURATION_LABEL[d]}</span><span>{price} ر.س</span>
                        </ConfirmSubmit>
                      </form>
                    ) : (
                      <Link key={d} href="/account/wallet#topup" className="flex w-full items-center justify-between rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-bold text-amber-800">
                        <span>{DURATION_LABEL[d]}</span><span>💳 {price}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* إضافة هوية جديدة */}
      <div className="card-3d rounded-2xl p-4">
        <h2 className="mb-1 flex items-center gap-1 text-sm font-extrabold text-primary"><Plus className="h-4 w-4" /> إضافة هوية شخصية جديدة</h2>
        {paidOn
          ? <p className="mb-3 text-xs text-amber-700">الهويات الإضافية ضمن <b>باقة اشتراك</b> (أدناه) — الحساب الرئيسي مجاني دائماً. {memberSub?.active ? `المتاح لك الآن: ${memberSub.slots >= 999 ? 'غير محدود' : memberSub.slots} هوية.` : 'اشترك بباقة لإضافة هويات.'}</p>
          : <p className="mb-3 text-xs text-muted-foreground">أضِف هوية للنشر باسمها وأيقونتها ولونها — الجوال للمراسلات فقط.</p>}
        <ProfileForm />
      </div>

      {/* إضافة متجر */}
      <div className="card-3d rounded-2xl p-4">
        <h2 className="mb-2 flex items-center gap-1 text-sm font-extrabold text-primary"><Store className="h-4 w-4" /> إضافة متجر</h2>
        <p className="mb-3 text-xs text-muted-foreground">افتح متجراً تحت حسابك الموحّد — يظهر كهوية نشر مستقلة باسمه وشعاره، وتُضاف تلقائياً إلى هوياتك هنا.</p>
        <Link href="/store" className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-white hover:opacity-90"><Plus className="h-4 w-4" /> إدارة/فتح متجر</Link>
      </div>

      {/* حساباتي المرتبطة — ربط وتبديل (كل حساب يبقى مستقلاً) */}
      <div id="merge" className="card-3d rounded-2xl border-2 border-amber-300 p-4">
        <h2 className="mb-1 flex items-center gap-1 text-sm font-extrabold text-amber-700"><Link2 className="h-4 w-4" /> حساباتي المرتبطة — إضافة حساب موجود</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          أدخل رقم حسابك الآخر، يصله رمز تحقّق فيُربط بحسابك للتنقّل من دخول واحد. <b>كل حساب يبقى مستقلاً</b> (لا نقل ولا حذف، قابل للفك).
          {paidOn && <span className="text-emerald-700"> وحساباتك الموجودة <b>معفاة من الاشتراك ٦ أشهر</b>.</span>}
        </p>

        {/* الحسابات المرتبطة حالياً + التبديل */}
        {otherLinked.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="text-xs font-extrabold text-foreground/80">مرتبطة بك ({otherLinked.length}) — اضغط للتبديل:</div>
            {otherLinked.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 truncate text-sm font-bold">
                    {a.hasStore ? <Store className="h-3.5 w-3.5 text-primary" /> : <UserRound className="h-3.5 w-3.5 text-primary" />}
                    <span className="truncate">{a.name}</span>
                    {a.hasStore && a.storeName && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{a.storeName}</span>}
                  </div>
                  {a.phone && <div className="text-[11px] text-muted-foreground" dir="ltr">{a.phone}</div>}
                </div>
                <form action={switchAccountAction}>
                  <input type="hidden" name="userId" value={a.id} />
                  <button className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"><Check className="h-3 w-3" /> تبديل</button>
                </form>
              </div>
            ))}
          </div>
        )}

        {/* حسابات مرشّحة للربط (تشارك هويتك الوطنية/بريدك) */}
        {candidates.length > 0 && !otpStage && (
          <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50/60 p-3">
            <div className="mb-2 flex items-center gap-1 text-xs font-extrabold text-emerald-800"><Sparkles className="h-3.5 w-3.5" /> حسابات نرجّح أنها تخصّك</div>
            <div className="space-y-2">
              {candidates.filter((c) => !otherLinked.some((l) => l.id === c.uid)).map((c) => (
                <form key={c.uid} action={startLinkOtpAction} className="flex items-center justify-between gap-2 rounded-lg bg-white p-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground" dir="ltr">{c.maskedPhone} · {c.via === 'national' ? 'نفس الهوية' : 'نفس البريد'}</div>
                  </div>
                  <input type="hidden" name="identifier" value={c.phone || String(c.uid)} />
                  <button className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"><MessageSquare className="h-3 w-3" /> أرسل الرمز</button>
                </form>
              ))}
            </div>
          </div>
        )}

        {!otpStage ? (
          /* الخطوة ١: أدخل الرقم → أرسل رمز التحقق */
          <form action={startLinkOtpAction} className="space-y-3">
            <div>
              <label className={lbl}>جوال الحساب الآخر (أو اسم مستخدمه/بريده)</label>
              <input name="identifier" required defaultValue={mIdent} className={field} placeholder="05xxxxxxxx" dir="ltr" autoComplete="off" />
            </div>
            <button className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-extrabold text-white hover:opacity-90">
              <MessageSquare className="h-4 w-4" /> أرسل رمز التحقق
            </button>
          </form>
        ) : (
          /* الخطوة ٢: أدخل الرمز الواصل → ربط */
          <form action={confirmLinkOtpAction} className="space-y-3">
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-xs font-bold text-emerald-800">
              أرسلنا رمز تحقّق إلى الرقم {sp.mmask ? <span dir="ltr">{sp.mmask}</span> : 'المسجّل'} — أدخله خلال ١٠ دقائق.
            </div>
            <input type="hidden" name="identifier" value={mIdent} />
            <div>
              <label className={lbl}>رمز التحقق (٤ أرقام)</label>
              <input name="code" required inputMode="numeric" maxLength={4} className={field} placeholder="____" dir="ltr" autoComplete="one-time-code" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ConfirmSubmit msg="ربط هذا الحساب بحسابك؟ يبقى مستقلاً بإعلاناته ورصيده، وتتنقّل إليه من دخول واحد." className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-extrabold text-white hover:opacity-90">
                <Link2 className="h-4 w-4" /> تأكيد الربط
              </ConfirmSubmit>
              <span className="text-[11px] text-muted-foreground">لم يصلك الرمز؟</span>
            </div>
          </form>
        )}
        {otpStage && (
          <form id="resend-merge" action={startLinkOtpAction} className="mt-2">
            <input type="hidden" name="identifier" value={mIdent} />
            <button className="text-xs font-bold text-amber-700 underline">إعادة إرسال الرمز أو تغيير الرقم →</button>
          </form>
        )}

        {/* التحقق بكلمة المرور (بديل لمن لا يصله الرمز) */}
        <details className="mt-4 border-t pt-3">
          <summary className="flex cursor-pointer items-center gap-1 text-xs font-bold text-muted-foreground"><KeyRound className="h-3.5 w-3.5" /> أو اربط بكلمة مرور الحساب الآخر بدل الرمز</summary>
          <form action={linkAccountAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={lbl}>جوال/بريد/اسم مستخدم الحساب الآخر</label>
              <input name="identifier" required className={field} placeholder="05xxxxxxxx" dir="ltr" autoComplete="off" />
            </div>
            <div>
              <label className={lbl}>كلمة مرور الحساب الآخر</label>
              <input name="password" type="password" required className={field} placeholder="••••••••" dir="ltr" autoComplete="off" />
            </div>
            <div className="sm:col-span-2">
              <button className="inline-flex items-center gap-1 rounded-lg bg-amber-700 px-4 py-2 text-sm font-extrabold text-white hover:opacity-90">
                <Link2 className="h-4 w-4" /> ربط بكلمة المرور
              </button>
            </div>
          </form>
        </details>

        <p className="mt-3 flex items-start gap-1 text-[11px] text-amber-700"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> تُدير حساباتك المرتبطة (وتفكّها) أيضاً من <Link href="/account/identities" className="font-bold underline">صفحة الحسابات المرتبطة</Link>.</p>
      </div>
    </div>
  );
}
