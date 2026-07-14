import Link from 'next/link';
import { Users, Link2, Store, Shield, User, Info, Zap, BellRing, ArrowRightLeft, LogIn } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { linkedAccounts } from '@/lib/account-links';
import { linkOwnAccountAction, setLinkModeAction, unlinkOwnAccountAction, switchAccountAction as switchTo } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'هوياتي والحسابات المرتبطة' };

export default async function IdentitiesPage({ searchParams }: { searchParams?: Promise<{ linked?: string; unlinked?: string; saved?: string; error?: string; msg?: string }> }) {
  const session = await requireUser();
  const sp = searchParams ? await searchParams : {};
  const accounts = await linkedAccounts(session.uid).catch(() => []);
  const others = accounts.filter((a) => a.id !== session.uid);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Users className="h-5 w-5" /></span>
        <div>
          <h1 className="text-xl font-bold text-primary">هوياتي والحسابات المرتبطة</h1>
          <p className="text-xs text-muted-foreground">ميزة اختيارية — اربط حساباتك المتعددة لتحصل على <b>دخول موحّد</b> وتنقّل بينها بلا كلمة مرور.</p>
        </div>
      </div>

      {/* رسائل النتيجة */}
      {sp.linked && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ تم ربط حساب «{sp.linked}» بنجاح — تجده بالأسفل ويمكنك التبديل إليه.</div>}
      {sp.saved === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ حُفظ التفضيل.</div>}
      {sp.unlinked === '1' && <div className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm font-bold text-sky-800">تم فكّ الارتباط.</div>}
      {sp.error === 'empty' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">أدخل بيانات الدخول كاملة.</div>}
      {sp.error === 'link' && <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">تعذّر الربط: {sp.msg || 'بيانات غير صحيحة'}.</div>}

      {/* ⓘ تعليمات مفصّلة: الفكرة والهدف والطريقة */}
      <details open className="overflow-hidden rounded-2xl border-2 border-primary/25 bg-primary/5">
        <summary className="flex cursor-pointer list-none items-center gap-2 bg-primary/10 px-4 py-3 text-sm font-extrabold text-primary">
          <Info className="h-5 w-5" /> ما هذه الميزة؟ وكيف أستخدمها؟ (اضغط للتفاصيل)
        </summary>
        <div className="space-y-3 p-4 text-[13px] leading-relaxed text-foreground">
          <div>
            <div className="mb-1 font-extrabold text-primary">🎯 الفكرة والهدف</div>
            <p>بعض الأشخاص لديهم أكثر من حساب في تربّح (بأرقام أو أسماء مختلفة) — حساب شخصي، ومتجر، وربما صفة إشراف. هذه الميزة <b>تربط حساباتك التي تملكها أنت</b> في مجموعة واحدة «نفس المالك» لتتنقّل بينها من دخول واحد دون إدخال كلمة المرور في كل مرة. <b>لا يُدمج شيء ولا يُحذف</b> — كل حساب يبقى مستقلاً بإعلاناته ورسائله ورصيده، والربط مجرّد علاقة تسهّل التنقّل.</p>
          </div>
          <div>
            <div className="mb-1 font-extrabold text-primary">🔗 الطريقة (خطوة بخطوة)</div>
            <ol className="mr-4 list-decimal space-y-1">
              <li>في صندوق «إضافة حساب مرتبط» بالأسفل، أدخل <b>اسم الدخول (أو الجوال) وكلمة المرور</b> لحسابك الآخر — بهذا تُثبت أنه لك فعلاً.</li>
              <li>يُضاف الحساب لمجموعتك، وتظهر تحته صفاته تلقائياً: <span className="font-bold text-sky-700">عضو</span> دائماً، و<span className="font-bold text-emerald-700">متجر</span> إن كان يملك متجراً، و<span className="font-bold text-amber-700">إدارة</span> إن كان مشرفاً.</li>
              <li>لكل حساب اختر سلوك التبديل: <b>«مباشر»</b> ينقلك فوراً، أو <b>«ذكّرني قبل أي إجراء»</b> يعرض تأكيداً قبل الانتقال (أأمن).</li>
              <li>كرّر لأي حساب آخر تملكه. وتنتقل بينها من «القائمة ← 🎭 هوياتي ← 🔗 التبديل لحساب آخر».</li>
              <li>يمكنك <b>فكّ ارتباط</b> أي حساب في أي وقت — يعود مستقلاً كما كان.</li>
            </ol>
          </div>
          <div>
            <div className="mb-1 font-extrabold text-primary">🔒 قواعد الأمان</div>
            <ul className="mr-4 list-disc space-y-1">
              <li><b>حساب واحد لمالك واحد:</b> لا يمكن ربط حساب مرتبط بشخص آخر — من يربط الحساب أولاً (بكلمة مروره) يملكه، ولا يستطيع شخص آخر ربطه معه.</li>
              <li><b>لا مشاركة حساب:</b> الربط لا يفتح الحساب لعدّة أشخاص — يبقى محمياً بكلمة مروره، والتبديل يصدر جلسة واحدة نشطة فقط (لا دخول متزامن لشخصين).</li>
              <li><b>دخول موحّد:</b> بعد الربط تدخل بأي حساب من حساباتك مرة واحدة، وتتنقّل لبقيتها من المبدّل بلا إعادة إدخال كلمة المرور.</li>
              <li><b>تحت سيطرتك:</b> فكّ ارتباط أي حساب في أي وقت فيعود مستقلاً، ويتوقّف التبديل إليه فوراً.</li>
            </ul>
          </div>
          <p className="rounded-lg bg-amber-50 p-2 text-[12px] font-bold text-amber-900">⚠️ اربط فقط الحسابات التي تملكها أنت. الإدارة قد ترى الحسابات المرتبطة كياناً واحداً لكنها لا تنشر أو تراسل بالنيابة عنك — أنت وحدك من يبدّل وينشر.</p>
        </div>
      </details>

      {/* الحساب الحالي */}
      <div className="rounded-2xl border-2 border-primary/20 bg-card p-3">
        <div className="mb-1 text-[11px] font-extrabold text-muted-foreground">حسابك الحالي</div>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-primary/5 px-3 py-2.5">
          <span className="flex items-center gap-2 font-bold text-foreground"><User className="h-4 w-4 text-primary" /> {session.name}</span>
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold text-white">أنت هنا</span>
        </div>
      </div>

      {/* الحسابات المرتبطة */}
      <div className="rounded-2xl border-2 border-primary/20 bg-card p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-primary"><Link2 className="h-4 w-4" /> حساباتك المرتبطة {others.length > 0 && <span className="rounded-full bg-primary/10 px-2 text-[11px]">{others.length}</span>}</div>
        {others.length === 0 ? (
          <p className="rounded-xl bg-muted/40 p-3 text-center text-sm text-muted-foreground">لا حسابات مرتبطة بعد. أضف حسابك الآخر من الصندوق بالأسفل.</p>
        ) : (
          <div className="space-y-2">
            {others.map((a) => (
              <div key={a.id} className="rounded-xl border border-primary/15 bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 font-bold text-foreground">
                    <User className="h-4 w-4 shrink-0 text-primary" /> <span className="line-clamp-1">{a.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-700">عضو</span>
                    {a.hasStore && <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700"><Store className="h-2.5 w-2.5" />{a.storeName || 'متجر'}</span>}
                    {a.isAdmin && <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700"><Shield className="h-2.5 w-2.5" />إدارة</span>}
                  </span>
                </div>
                {a.phone && <div dir="ltr" className="mt-0.5 text-right text-[11px] text-muted-foreground">{a.phone}</div>}

                {/* سلوك التبديل: مباشر / ذكّرني */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-muted-foreground">عند التبديل:</span>
                  <form action={setLinkModeAction}>
                    <input type="hidden" name="userId" value={a.id} />
                    <input type="hidden" name="mode" value="direct" />
                    <button type="submit" className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${a.mode === 'direct' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
                      <Zap className="h-3 w-3" /> مباشر
                    </button>
                  </form>
                  <form action={setLinkModeAction}>
                    <input type="hidden" name="userId" value={a.id} />
                    <input type="hidden" name="mode" value="confirm" />
                    <button type="submit" className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${a.mode === 'confirm' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
                      <BellRing className="h-3 w-3" /> ذكّرني قبل أي إجراء
                    </button>
                  </form>
                </div>

                <div className="mt-2 flex items-center gap-2 border-t border-primary/10 pt-2">
                  <form action={switchTo} className="flex-1">
                    <input type="hidden" name="userId" value={a.id} />
                    <button type="submit" className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-[12px] font-bold text-primary hover:bg-primary/20">
                      <ArrowRightLeft className="h-3.5 w-3.5" /> التبديل لهذا الحساب
                    </button>
                  </form>
                  <form action={unlinkOwnAccountAction}>
                    <input type="hidden" name="userId" value={a.id} />
                    <button type="submit" className="rounded-lg border border-destructive/30 px-3 py-1.5 text-[12px] font-bold text-destructive hover:bg-destructive/10">فكّ الارتباط</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* الدخول بحساب آخر — أضف حساباتك واحداً تلو الآخر حتى تكتمل */}
      <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-50/40 p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-extrabold text-emerald-800"><LogIn className="h-4 w-4" /> الدخول بحساب آخر</div>
        <p className="mb-3 text-[12px] text-muted-foreground">أدخل بيانات دخول حسابك الآخر (جوال أو اسم المستخدم + كلمة المرور) لإثبات ملكيته وإضافته لحساباتك — تُستخدم للتحقق فقط ولا تُحفظ كلمة المرور. كرّر حتى تكتمل كل حساباتك.</p>
        <form action={linkOwnAccountAction} className="space-y-2">
          <input name="identifier" required placeholder="الجوال أو اسم المستخدم للحساب الآخر" className="w-full rounded-lg border border-primary/20 bg-background px-3 py-2.5 text-sm" />
          <input name="password" type="password" required placeholder="كلمة مرور الحساب الآخر" className="w-full rounded-lg border border-primary/20 bg-background px-3 py-2.5 text-sm" />
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
            <LogIn className="h-4 w-4" /> الدخول وإضافة الحساب
          </button>
        </form>
        <Link href="/forgot" className="mt-2 block text-center text-[12px] font-bold text-primary hover:underline">نسيت كلمة مرور الحساب الآخر؟ تحقّق عبر جوالك</Link>
      </div>

      <Link href="/account" className="block text-center text-sm font-bold text-primary hover:underline">← العودة للوحة حسابي</Link>
    </div>
  );
}
