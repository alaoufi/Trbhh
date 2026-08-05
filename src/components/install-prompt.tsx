'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download, X, Share, Plus, MoreVertical } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * لافتة علوية بلون مميّز: «ثبّت … على جهازك».
 * - scope="site": تطبيق عقار تربح (تُخفى داخل واجهات المتاجر المستقلة).
 * - scope="store": تطبيق متجر مستقل (اسمه/لونه) عبر manifest المتجر.
 * تستخدم beforeinstallprompt (كروم/أندرويد) وإرشادات يدوية على iOS، ومع فشل
 * الإطلاق التلقائي تعرض إرشاد التثبيت من قائمة المتصفح بعد ثوانٍ.
 */
export function InstallPrompt({
  scope = 'site', name = 'عقار تربح', brand, storageKey = 'trbhh_install_v2',
}: { scope?: 'site' | 'store'; name?: string; brand?: string; storageKey?: string }) {
  const pathname = usePathname() || '';
  const inStoreCtx = /^\/companies\//.test(pathname) || /^\/store(\/|$|-)/.test(pathname);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [manual, setManual] = useState(false);

  const neverKey = storageKey;
  const sessionKey = `${storageKey}_s`;

  useEffect(() => {
    if (scope === 'site' && inStoreCtx) return;
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return; // مثبّت بالفعل
    try {
      if (localStorage.getItem(neverKey) === '1') return;
      if (sessionStorage.getItem(sessionKey) === '1') return;
    } catch { /* ignore */ }

    const w = window as unknown as { __bipEvent?: BeforeInstallPromptEvent | null };
    const pick = () => { const ev = w.__bipEvent; if (ev) { setDeferred(ev); setManual(false); setShow(true); } };
    pick();
    window.addEventListener('bipready', pick);
    const onPrompt = (e: Event) => { e.preventDefault(); w.__bipEvent = e as BeforeInstallPromptEvent; setDeferred(e as BeforeInstallPromptEvent); setManual(false); setShow(true); };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const ua = window.navigator.userAgent.toLowerCase();
    const isIosSafari = /iphone|ipad|ipod/.test(ua) && /safari/.test(ua) && !/crios|fxios/.test(ua);
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (isIosSafari) {
      timers.push(setTimeout(() => { setIos(true); setShow(true); }, 2500));
    } else {
      // لم يُطلق حدث التثبيت التلقائي؟ اعرض إرشاد التثبيت اليدوي من قائمة المتصفح.
      timers.push(setTimeout(() => { if (!w.__bipEvent) { setManual(true); setShow(true); } }, 4000));
    }

    const onInstalled = () => setShow(false);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('bipready', pick); window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); timers.forEach(clearTimeout); };
  }, [inStoreCtx, scope, storageKey, neverKey, sessionKey]);

  const close = () => { setShow(false); try { sessionStorage.setItem(sessionKey, '1'); } catch { /* ignore */ } };
  const never = () => { setShow(false); try { localStorage.setItem(neverKey, '1'); } catch { /* ignore */ } };
  const install = async () => {
    if (!deferred) return;
    try { await deferred.prompt(); await deferred.userChoice; } catch { /* ignore */ }
    try { (window as unknown as { __bipEvent?: unknown }).__bipEvent = null; } catch { /* ignore */ }
    setDeferred(null);
    setShow(false);
    try { localStorage.setItem(neverKey, '1'); } catch { /* ignore */ }
  };

  if (!show) return null;
  const bg = brand || 'hsl(var(--primary))';
  const label = scope === 'store' ? `متجر ${name}` : 'تطبيق عقار تربح';
  const mode: 'button' | 'ios' | 'manual' = deferred ? 'button' : ios ? 'ios' : 'manual';

  return (
    <div className="fixed inset-x-0 top-0 z-[200] px-2 pt-[max(0.4rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-2xl items-center gap-2.5 rounded-b-2xl px-3 py-2 text-white shadow-xl ring-1 ring-black/10" style={{ background: bg }}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/20"><Download className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold">ثبّت {label} على جهازك</div>
          {mode === 'ios' && (
            <p className="flex flex-wrap items-center gap-1 text-[11px] opacity-95">اضغط <Share className="inline h-3.5 w-3.5" /> ثم <Plus className="inline h-3.5 w-3.5" /> «إضافة إلى الشاشة الرئيسية».</p>
          )}
          {mode === 'manual' && (
            <p className="flex flex-wrap items-center gap-1 text-[11px] opacity-95">من قائمة المتصفح <MoreVertical className="inline h-3.5 w-3.5" /> اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</p>
          )}
          {mode === 'button' && (
            <p className="truncate text-[11px] opacity-90">وصول أسرع من سطح المكتب/الشاشة الرئيسية.</p>
          )}
          <button onClick={never} className="mt-0.5 text-[10px] font-medium text-white/75 underline underline-offset-2 hover:text-white">لا تظهر لاحقاً</button>
        </div>
        {mode === 'button' && (
          <button onClick={install} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-extrabold shadow" style={{ color: bg }}>
            تثبيت
          </button>
        )}
        <button onClick={close} aria-label="إغلاق" className="shrink-0 rounded-lg p-1 text-white/90 hover:bg-white/15"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
