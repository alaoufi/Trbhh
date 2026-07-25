import Image from 'next/image';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { UserRound, Store, Check, Pencil, Trash2, Plus, Star, Link2, ShieldAlert, MessageSquare, KeyRound, Sparkles } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { getUserProfiles, getActiveProfile, PROFILES_INTRO_COOKIE, type Profile } from '@/lib/profiles';
import { getMergeCandidates } from '@/lib/account-merge';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { addProfileAction, updateProfileAction, deleteProfileAction, switchProfileAction, mergeAccountAction, startMergeOtpAction, confirmMergeOtpAction, dismissProfilesIntroAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'هوياتي — حسابات ومتاجر' };

const PRESET_COLORS = ['#3287da', '#16a34a', '#db2777', '#9333ea', '#ea580c', '#0d9488', '#dc2626', '#4f46e5'];
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
        <label className={lbl}>لون الهوية (للتفريق البصري)</label>
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_COLORS.map((c) => (
            <label key={c} className="relative cursor-pointer">
              <input type="radio" name="color" value={c} defaultChecked={p?.color === c} className="peer sr-only" />
              <span className="block h-7 w-7 rounded-full ring-2 ring-transparent ring-offset-2 peer-checked:ring-foreground" style={{ background: c }} />
            </label>
          ))}
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            مخصّص: <input type="color" name="color" defaultValue={p?.color || '#3287da'} className="h-7 w-9 cursor-pointer rounded border" />
          </label>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">اختر لوناً واحداً (المخصّص يتقدّم إن غيّرته).</p>
      </div>
      <button className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-white hover:opacity-90">
        {edit ? <><Check className="h-4 w-4" /> حفظ التعديلات</> : <><Plus className="h-4 w-4" /> إضافة الهوية</>}
      </button>
    </form>
  );
}

export default async function ProfilesPage({ searchParams }: { searchParams: Promise<{ error?: string; max?: string; added?: string; saved?: string; deleted?: string; merror?: string; merged?: string; ads?: string; bal?: string; motp?: string; mident?: string; mmask?: string; omsg?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;
  const [profiles, active, candidates, cookieStore] = await Promise.all([getUserProfiles(session.uid), getActiveProfile(session.uid), getMergeCandidates(session.uid).catch(() => []), cookies()]);
  const otpStage = sp.motp === '1';
  const mIdent = sp.mident || '';
  const showIntro = cookieStore.get(PROFILES_INTRO_COOKIE)?.value !== '1';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <UserRound className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">هوياتي — حسابات ومتاجر</h1>
      </div>
      <p className="text-sm text-muted-foreground">دخول واحد، وعدّة هويات للنشر — كل هوية ببياناتها المستقلة (اسم/جوال/بريد/صورة/لون). اختر الهوية الفعّالة لتُعلن باسمها.</p>

      {/* رسالة تعريفية تُعرض أول مرة فقط: شرح الميزة وخطوات استخدامها */}
      {showIntro && (
        <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-base font-extrabold text-primary">مرحباً بك في «هوياتي» — دخول واحد وعدّة هويات</h2>
          </div>
          <p className="mb-3 text-sm text-foreground/80">
            تقدر الآن تُدير أكثر من هوية للنشر من دخول واحد: هوية شخصية أو أكثر، ومتجراً أو أكثر — كل واحدة باسمها وجوالها وصورتها ولونها،
            دون أن تختلط ببعضها. إليك الخطوات:
          </p>
          <ol className="space-y-2 text-sm">
            {[
              ['هويتك الأساسية جاهزة', 'أُنشئت تلقائياً باسمك وجوالك — تظهر أعلى كل صفحة في شريط «أنت: …».'],
              ['أضِف هوية شخصية جديدة', 'من قسم «إضافة هوية شخصية» أدناه: اسم ظاهر، جوال/واتساب/بريد للمراسلات، صورة، ولون مميّز.'],
              ['أضِف متجراً', 'من «إضافة متجر» تفتح متجرك المستقل، ويظهر تلقائياً كهوية نشر باسمه وشعاره.'],
              ['بدّل الهوية الفعّالة قبل النشر', 'من الشريط أعلى الصفحة اضغط «تفعيل» على الهوية التي تريد الإعلان باسمها — كل إعلان يحمل بيانات الهوية الفعّالة وقتها.'],
              ['عندك حساب قديم منفصل؟ اجمعه', 'من «اجمع حساباً منفصلاً» أدخل رقمه، يصلك رمز تحقّق على ذلك الرقم، فتُنقل إعلاناته ورصيده إليك ويصبح دخولك موحّداً.'],
            ].map(([t, d], i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-extrabold text-white">{i + 1}</span>
                <span><b className="font-extrabold text-foreground">{t}:</b> <span className="text-foreground/75">{d}</span></span>
              </li>
            ))}
          </ol>
          <form action={dismissProfilesIntroAction} className="mt-3">
            <button className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-xs font-extrabold text-white hover:opacity-90"><Check className="h-3.5 w-3.5" /> فهمت، ابدأ</button>
          </form>
        </div>
      )}

      {sp.error === 'limit' && <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">بلغت الحد الأقصى لعدد الهويات الشخصية{sp.max ? ` (${sp.max})` : ''}.</div>}
      {sp.error === 'handle' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">المعرّف الظاهر مستخدم مسبقاً — اختر غيره.</div>}
      {sp.error === 'name' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">الاسم الظاهر مطلوب.</div>}
      {(sp.added || sp.saved || sp.deleted) && <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ تم الحفظ.</div>}
      {sp.merged && <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ تم دمج الحساب في حسابك الموحّد — نُقل {sp.ads || 0} إعلان{Number(sp.bal) > 0 ? ` وأُضيف رصيد ${sp.bal} ريال` : ''}. سجّل الدخول من هذا الحساب فقط بعد الآن.</div>}
      {sp.merror === 'creds' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">أكمل بيانات الحساب الآخر.</div>}
      {sp.merror === 'verify' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">بيانات دخول الحساب الآخر غير صحيحة.</div>}
      {sp.merror === 'badcode' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">رمز التحقق غير صحيح أو منتهي — أعد الإرسال وحاول مجدداً.</div>}
      {sp.merror === 'notfound' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">لا يوجد حساب بهذا المُعرّف.</div>}
      {sp.merror === 'nophone' && <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">هذا الحساب بلا رقم جوال مسجّل — استخدم «التحقق بكلمة المرور» بدل الرمز.</div>}
      {sp.merror === 'otp' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">تعذّر إرسال الرمز{sp.omsg ? `: ${sp.omsg}` : ''}.</div>}
      {sp.merror === 'self' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">هذا هو حسابك الحالي — أدخل حساباً آخر تريد دمجه.</div>}
      {sp.merror === 'admin' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">لا يمكن دمج حساب إداري.</div>}
      {sp.merror === 'alreadymerged' && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">هذا الحساب مدموج بالفعل.</div>}
      {sp.merror && !['creds', 'verify', 'badcode', 'notfound', 'nophone', 'otp', 'self', 'admin', 'alreadymerged'].includes(sp.merror) && <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">تعذّر دمج الحساب — حاول لاحقاً.</div>}

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
          <div key={p.id} className="card-3d rounded-xl p-3" style={{ borderInlineStart: `4px solid ${p.color || '#cbd5e1'}` }}>
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

      {/* إضافة هوية جديدة */}
      <div className="card-3d rounded-2xl p-4">
        <h2 className="mb-3 flex items-center gap-1 text-sm font-extrabold text-primary"><Plus className="h-4 w-4" /> إضافة هوية شخصية جديدة</h2>
        <ProfileForm />
      </div>

      {/* إضافة متجر */}
      <div className="card-3d rounded-2xl p-4">
        <h2 className="mb-2 flex items-center gap-1 text-sm font-extrabold text-primary"><Store className="h-4 w-4" /> إضافة متجر</h2>
        <p className="mb-3 text-xs text-muted-foreground">افتح متجراً تحت حسابك الموحّد — يظهر كهوية نشر مستقلة باسمه وشعاره، وتُضاف تلقائياً إلى هوياتك هنا.</p>
        <Link href="/store" className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-white hover:opacity-90"><Plus className="h-4 w-4" /> إدارة/فتح متجر</Link>
      </div>

      {/* دمج حساب قديم منفصل */}
      <div id="merge" className="card-3d rounded-2xl border-2 border-amber-300 p-4">
        <h2 className="mb-1 flex items-center gap-1 text-sm font-extrabold text-amber-700"><Link2 className="h-4 w-4" /> عندك حساب آخر منفصل؟ اجمعه هنا</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          إن كان لديك حساب قديم بدخول مستقل (ولو برقم مختلف)، اجمعه في حسابك الحالي: تُنقل إعلاناته كهوية نشر جديدة، ويُضاف رصيده إلى رصيدك،
          ثم يتوقّف الدخول المستقل لذلك الحساب (تدخل من حسابك الحالي فقط). نثبت ملكيتك له برمز تحقّق يصل لرقمه.
        </p>

        {/* حسابات مرشّحة للدمج (تشارك هويتك الوطنية/بريدك) */}
        {candidates.length > 0 && !otpStage && (
          <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50/60 p-3">
            <div className="mb-2 flex items-center gap-1 text-xs font-extrabold text-emerald-800"><Sparkles className="h-3.5 w-3.5" /> حسابات نرجّح أنها تخصّك</div>
            <div className="space-y-2">
              {candidates.map((c) => (
                <form key={c.uid} action={startMergeOtpAction} className="flex items-center justify-between gap-2 rounded-lg bg-white p-2">
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
          <form action={startMergeOtpAction} className="space-y-3">
            <div>
              <label className={lbl}>جوال الحساب الآخر (أو اسم مستخدمه/بريده)</label>
              <input name="identifier" required defaultValue={mIdent} className={field} placeholder="05xxxxxxxx" dir="ltr" autoComplete="off" />
            </div>
            <button className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-extrabold text-white hover:opacity-90">
              <MessageSquare className="h-4 w-4" /> أرسل رمز التحقق
            </button>
          </form>
        ) : (
          /* الخطوة ٢: أدخل الرمز الواصل → دمج */
          <form action={confirmMergeOtpAction} className="space-y-3">
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-xs font-bold text-emerald-800">
              أرسلنا رمز تحقّق إلى الرقم {sp.mmask ? <span dir="ltr">{sp.mmask}</span> : 'المسجّل'} — أدخله خلال ١٠ دقائق.
            </div>
            <input type="hidden" name="identifier" value={mIdent} />
            <div>
              <label className={lbl}>رمز التحقق (٦ أرقام)</label>
              <input name="code" required inputMode="numeric" maxLength={6} className={field} placeholder="______" dir="ltr" autoComplete="one-time-code" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ConfirmSubmit msg="دمج هذا الحساب في حسابك الحالي؟ سيتوقّف الدخول المستقل للحساب الآخر نهائياً، وتُنقل إعلاناته ورصيده إليك." className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-extrabold text-white hover:opacity-90">
                <Link2 className="h-4 w-4" /> تأكيد الدمج
              </ConfirmSubmit>
              <span className="text-[11px] text-muted-foreground">لم يصلك الرمز؟</span>
            </div>
            <div className="border-t pt-2">
              <input form="resend-merge" type="hidden" name="identifier" value={mIdent} />
            </div>
          </form>
        )}
        {otpStage && (
          <form id="resend-merge" action={startMergeOtpAction} className="mt-2">
            <input type="hidden" name="identifier" value={mIdent} />
            <button className="text-xs font-bold text-amber-700 underline">إعادة إرسال الرمز أو تغيير الرقم →</button>
          </form>
        )}

        {/* التحقق بكلمة المرور (بديل لمن لا يصله الرمز) */}
        <details className="mt-4 border-t pt-3">
          <summary className="flex cursor-pointer items-center gap-1 text-xs font-bold text-muted-foreground"><KeyRound className="h-3.5 w-3.5" /> أو تحقّق بكلمة مرور الحساب الآخر بدل الرمز</summary>
          <form action={mergeAccountAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={lbl}>جوال/بريد/اسم مستخدم الحساب الآخر</label>
              <input name="identifier" required className={field} placeholder="05xxxxxxxx" dir="ltr" autoComplete="off" />
            </div>
            <div>
              <label className={lbl}>كلمة مرور الحساب الآخر</label>
              <input name="password" type="password" required className={field} placeholder="••••••••" dir="ltr" autoComplete="off" />
            </div>
            <div className="sm:col-span-2">
              <ConfirmSubmit msg="دمج هذا الحساب في حسابك الحالي؟ سيتوقّف الدخول المستقل للحساب الآخر نهائياً، وتُنقل إعلاناته ورصيده إليك." className="inline-flex items-center gap-1 rounded-lg bg-amber-700 px-4 py-2 text-sm font-extrabold text-white hover:opacity-90">
                <Link2 className="h-4 w-4" /> دمج بكلمة المرور
              </ConfirmSubmit>
            </div>
          </form>
        </details>

        <p className="mt-3 flex items-start gap-1 text-[11px] text-amber-700"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> الدمج نهائي ولا يمكن التراجع عنه — تأكّد أن الحساب الآخر يخصّك.</p>
      </div>
    </div>
  );
}
