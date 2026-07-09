'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Wallet, HandCoins, Copy, Check, Landmark, Camera, Send, Clock, CheckCircle2,
  MessageCircle, Sparkles, Crown, ChevronRight, ChevronLeft, Play, Pause, RotateCcw, Share2,
} from 'lucide-react';

const SLIDE_MS = 5200;

/** إطار جوال محاكٍ يعرض داخله «لقطة» متحركة لكل خطوة. */
function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2rem] border-[6px] border-slate-800 bg-white shadow-2xl">
      <div className="mx-auto mt-1.5 h-1.5 w-16 rounded-full bg-slate-300" />
      <div className="h-[380px] overflow-hidden rounded-b-[1.6rem] rounded-t-lg bg-slate-50 p-3" dir="rtl">{children}</div>
    </div>
  );
}

function Tap({ className = '' }: { className?: string }) {
  return <span className={`tut-tap pointer-events-none absolute z-10 grid h-9 w-9 place-items-center rounded-full ${className}`}>👆</span>;
}

/** عدّاد رصيد يصعد من 0 إلى 100 عند ظهور الشريحة. */
function CountUp({ active }: { active: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) { setN(0); return; }
    let v = 0;
    const t = setInterval(() => { v += 5; setN(v); if (v >= 100) clearInterval(t); }, 60);
    return () => clearInterval(t);
  }, [active]);
  return <span>{n}</span>;
}

export function TopupTutorial() {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [shared, setShared] = useState(false);

  const slides: { caption: string; body: (active: boolean) => React.ReactNode }[] = [
    {
      caption: 'من لوحة حسابك اضغط بطاقة «شحن رصيدك»',
      body: () => (
        <div className="space-y-2">
          <div className="rounded-lg bg-white p-2 text-xs font-bold shadow-sm">مرحباً بك 👋</div>
          <div className="flex items-center gap-2 rounded-lg bg-white p-2 text-xs shadow-sm"><span className="grid h-7 w-7 place-items-center rounded bg-sky-100 text-sky-700">📢</span> إعلاناتي</div>
          <div className="relative flex items-center gap-2 rounded-lg border-2 border-emerald-500 bg-emerald-50 p-2.5 text-xs font-extrabold text-emerald-800 shadow tut-pulse">
            <Wallet className="h-5 w-5" /> شحن رصيدك
            <span className="mr-auto rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] text-white">رصيدك: 0 ر.س</span>
            <Tap className="-bottom-3 left-8" />
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white p-2 text-xs shadow-sm"><span className="grid h-7 w-7 place-items-center rounded bg-amber-100 text-amber-700">⭐</span> تقييماتي</div>
        </div>
      ),
    },
    {
      caption: 'انسخ بيانات الحساب: البنك، رقم الحساب، الآيبان، والاسم — وتأكد من الاسم قبل التحويل',
      body: () => (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-extrabold text-sky-800"><HandCoins className="h-4 w-4" /> شحن رصيدك</div>
          <div className="space-y-1.5 rounded-xl border-2 border-sky-200 bg-white p-2.5 text-[11px]">
            <div className="flex items-center justify-between"><span><b className="text-slate-400">البنك:</b> <b>مصرف الراجحي</b></span><span className="rounded-full border border-sky-300 px-2 py-0.5 text-[9px] font-bold text-sky-700">نسخ</span></div>
            <div className="flex items-center justify-between"><span><b className="text-slate-400">رقم الحساب:</b> <b dir="ltr" className="text-sky-700">1234567890</b></span><span className="rounded-full border border-sky-300 px-2 py-0.5 text-[9px] font-bold text-sky-700">نسخ</span></div>
            <div className="relative flex items-center justify-between">
              <span><b className="text-slate-400">الآيبان:</b> <b dir="ltr" className="text-sky-700">SA00 0000…</b></span>
              <span className="tut-copyflash rounded-full border px-2 py-0.5 text-[9px] font-bold">نسخ</span>
              <Tap className="-bottom-4 left-2" />
            </div>
            <div><b className="text-slate-400">اسم صاحب الحساب:</b> <b>شركة تربح</b>
              <div className="mt-0.5 text-[10px] font-bold text-amber-700">⚠ تأكد من الاسم قبل التحويل</div>
            </div>
          </div>
        </div>
      ),
    },
    {
      caption: 'حوّل المبلغ من تطبيق بنكك ثم التقط صورة الإيصال',
      body: () => (
        <div className="space-y-2">
          <div className="rounded-xl bg-slate-800 p-3 text-white">
            <div className="flex items-center gap-1.5 text-xs font-bold"><Landmark className="h-4 w-4" /> تطبيق البنك</div>
            <div className="mt-2 rounded-lg bg-slate-700 p-2 text-[11px]">المستفيد: <b>شركة تربح</b></div>
            <div className="mt-1.5 rounded-lg bg-slate-700 p-2 text-[11px]">المبلغ: <b className="text-emerald-300">100 ر.س</b></div>
            <div className="relative mt-2 rounded-lg bg-emerald-500 p-2 text-center text-xs font-extrabold tut-pulse">تحويل ✓<Tap className="-bottom-3 left-10" /></div>
          </div>
          <div className="tut-rise flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sky-300 bg-sky-50 p-2.5 text-xs font-bold text-sky-800">
            <Camera className="h-5 w-5" /> صورة الإيصال 🧾
          </div>
        </div>
      ),
    },
    {
      caption: 'ارجع إلى «شحن رصيدك»: اكتب المبلغ وأرفق صورة الإيصال ثم أرسل الطلب',
      body: () => (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-extrabold text-sky-800"><HandCoins className="h-4 w-4" /> شحن رصيدك</div>
          <div className="rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
            <div className="text-slate-400">المبلغ (ر.س)</div>
            <div className="tut-type overflow-hidden whitespace-nowrap text-base font-extrabold text-slate-800">100</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
            <div className="text-slate-400">إيصال التحويل</div>
            <div className="tut-rise flex items-center gap-1.5 font-bold text-emerald-700"><Check className="h-4 w-4" /> receipt.jpg 🧾</div>
          </div>
          <div className="relative rounded-lg bg-sky-600 p-2.5 text-center text-xs font-extrabold text-white tut-pulse">
            <span className="inline-flex items-center gap-1.5"><Send className="h-4 w-4" /> إرسال طلب الشحن</span>
            <Tap className="-bottom-3 left-12" />
          </div>
        </div>
      ),
    },
    {
      caption: 'وصل طلبك للإدارة — تتحقق من وصول المبلغ ثم تؤكده',
      body: () => (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <span className="tut-spin-slow grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-amber-600"><Clock className="h-9 w-9" /></span>
          <div className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-extrabold text-amber-800">بانتظار تأكيد الإدارة</div>
          <p className="text-[11px] font-bold text-slate-500">تراجع الإدارة الإيصال وتتأكد من وصول المبلغ في الحساب</p>
        </div>
      ),
    },
    {
      caption: 'بعد التأكيد: يُضاف المبلغ لرصيدك فوراً وتصلك رسالة شكر',
      body: (active) => (
        <div className="space-y-3">
          <div className="rounded-xl border-2 border-emerald-400 bg-white p-3 text-center">
            <div className="text-[11px] font-bold text-slate-400">الرصيد المتاح</div>
            <div className="text-3xl font-extrabold text-emerald-600"><CountUp active={active} /> <span className="text-sm">ر.س</span></div>
            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> تم التأكيد</div>
          </div>
          <div className="tut-rise flex items-start gap-1.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-600 text-white"><MessageCircle className="h-4 w-4" /></span>
            <div className="rounded-2xl rounded-tr-sm bg-sky-50 p-2 text-[10px] font-bold leading-relaxed text-slate-700">شكراً لثقتك في منصة تربح 🎉 تم إضافة رصيد بمبلغ 100 ر.س — يمكنك استخدامه في المدفوعات المختلفة.</div>
          </div>
        </div>
      ),
    },
    {
      caption: 'استخدم رصيدك في كل الخدمات — يُخصم تلقائياً وكل حركة مسجّلة في محفظتك',
      body: () => (
        <div className="flex h-full flex-col items-center justify-center gap-2.5">
          {[
            { icon: Crown, t: 'تمييز إعلانك', c: 'bg-amber-100 text-amber-700' },
            { icon: Sparkles, t: 'إعلان مبوّب بالمصمم الذكي', c: 'bg-violet-100 text-violet-700' },
            { icon: Copy, t: 'باقات التكرار', c: 'bg-sky-100 text-sky-700' },
          ].map((x, k) => (
            <div key={k} className="tut-rise flex w-full items-center gap-2 rounded-xl bg-white p-2.5 text-xs font-extrabold shadow" style={{ animationDelay: `${k * 0.35}s` }}>
              <span className={`grid h-8 w-8 place-items-center rounded-lg ${x.c}`}><x.icon className="h-4 w-4" /></span> {x.t}
            </div>
          ))}
        </div>
      ),
    },
  ];

  const n = slides.length;
  const go = (k: number, manual = false) => { setI(((k % n) + n) % n); if (manual) restart(); };
  const restart = () => { if (timer.current) clearInterval(timer.current); if (playing) timer.current = setInterval(() => setI((v) => (v + 1) % n), SLIDE_MS); };

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (playing) timer.current = setInterval(() => setI((v) => (v + 1) % n), SLIDE_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, n]);

  async function share() {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: 'شرح شحن الرصيد — تربح', url }); } catch { /* cancelled */ } return; }
    try { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 1500); } catch { /* ignore */ }
  }

  return (
    <div className="space-y-3">
      <style>{`
        @keyframes tutTap { 0%,100% { transform: scale(1); opacity: .95; } 50% { transform: scale(1.35); opacity: .6; } }
        .tut-tap { animation: tutTap 1.1s ease-in-out infinite; font-size: 22px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
        @keyframes tutPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.035); } }
        .tut-pulse { animation: tutPulse 1.3s ease-in-out infinite; }
        @keyframes tutRise { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .tut-rise { animation: tutRise .8s ease-out both; }
        @keyframes tutType { from { max-width: 0; } to { max-width: 100%; } }
        .tut-type { animation: tutType 1.4s steps(6) .3s both; }
        @keyframes tutCopy { 0%,45% { background: #fff; color: #0369a1; border-color: #7dd3fc; } 55%,100% { background: #dcfce7; color: #15803d; border-color: #86efac; } }
        .tut-copyflash { animation: tutCopy 2.4s ease-in-out infinite; }
        @keyframes tutSpin { to { transform: rotate(8deg); } from { transform: rotate(-8deg); } }
        .tut-spin-slow { animation: tutSpin 1s ease-in-out infinite alternate; }
        @keyframes tutBar { from { width: 0; } to { width: 100%; } }
        .tut-bar { animation: tutBar ${SLIDE_MS}ms linear both; }
        @keyframes tutSlide { from { transform: translateX(-24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .tut-slide { animation: tutSlide .45s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .tut-tap,.tut-pulse,.tut-rise,.tut-type,.tut-copyflash,.tut-spin-slow,.tut-slide { animation-duration: .01s; animation-iteration-count: 1; } }
      `}</style>

      {/* شريط التقدّم */}
      <div className="flex gap-1">
        {slides.map((_, k) => (
          <div key={k} className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15">
            {k < i && <div className="h-full w-full bg-primary" />}
            {k === i && playing && <div key={`${i}-bar`} className="tut-bar h-full bg-primary" />}
            {k === i && !playing && <div className="h-full w-1/2 bg-primary" />}
          </div>
        ))}
      </div>

      {/* الشريحة */}
      <div key={i} className="tut-slide">
        <Phone>{slides[i].body(true)}</Phone>
      </div>

      {/* الشرح */}
      <div className="mx-auto max-w-md rounded-2xl border-2 border-primary/25 bg-card p-3 text-center">
        <div className="text-xs font-extrabold text-primary">الخطوة {i + 1} من {n}</div>
        <p className="mt-1 text-sm font-extrabold leading-relaxed text-foreground">{slides[i].caption}</p>
      </div>

      {/* التحكم */}
      <div className="flex items-center justify-center gap-2">
        <button onClick={() => go(i + 1, true)} aria-label="التالي" className="btn-3d grid h-11 w-11 place-items-center rounded-full bg-primary text-white"><ChevronLeft className="h-5 w-5" /></button>
        <button onClick={() => setPlaying((v) => !v)} aria-label={playing ? 'إيقاف' : 'تشغيل'} className="btn-3d grid h-12 w-12 place-items-center rounded-full bg-primary text-white">
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button onClick={() => go(i - 1, true)} aria-label="السابق" className="btn-3d grid h-11 w-11 place-items-center rounded-full bg-primary text-white"><ChevronRight className="h-5 w-5" /></button>
        <button onClick={() => { go(0, true); setPlaying(true); }} aria-label="إعادة" className="grid h-11 w-11 place-items-center rounded-full border-2 border-primary/30 text-primary"><RotateCcw className="h-5 w-5" /></button>
      </div>

      {/* مشاركة + ابدأ */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <button onClick={share} className="btn-3d inline-flex items-center gap-1.5 rounded-full border-2 border-primary/30 bg-white px-4 py-2 text-sm font-bold text-primary">
          {shared ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />} {shared ? 'تم نسخ الرابط' : 'مشاركة الشرح'}
        </button>
        <Link href="/account/wallet#topup" className="btn-3d inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white">
          <HandCoins className="h-4 w-4" /> ابدأ شحن رصيدك الآن
        </Link>
      </div>
    </div>
  );
}
