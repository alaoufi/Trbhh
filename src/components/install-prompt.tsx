'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download, X, Share, Plus } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * لافتة علوية بلون مميّز: «ثبّت … على جهازك».
 * - scope="site": تطبيق تربح (تُخفى داخل واجهات المتاجر المستقلة).
 * - scope="store": تطبيق متجر مستقل (اسمه/لونه)، يُركّب في صفحة المتجر التي
 *   تربط manifest المتجر، فيُثبَّت المتجر كتطبيق منفصل.
 * تستخدم beforeinstallprompt (كروم/أندرويد) وإرشادات يدوية على iOS.
 */
export function InstallPrompt({
  scope = 'site', name = 'تربح', brand, storageKey = 'trbhh_install_dismissed',
}: { scope?: 'site' | 'store'; name?: string; brand?: string; storageKey?: string }) {
  const pathname = usePathname() || '';
  const inStoreCtx = /^\/companies\//.test(pathname) || /^\/store(\/|$|-)/.test(pathname);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (scope === 'site' && inStoreCtx) return; // لافتة تربح لا تظهر داخل المتاجر
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    try { if (localStorage.getItem(storageKey) === '1') return; } catch { /* ignore */ }

    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); setShow(true); };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const ua = window.navigator.userAgent.toLowerCase();
    const isIosSafari = /iphone|ipad|ipod/.test(ua) && /safari/.test(ua) && !/crios|fxios/.test(ua);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (isIosSafari) t = setTimeout(() => { setIos(true); setShow(true); }, 2500);

    const onInstalled = () => setShow(false);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); if (t) clearTimeout(t); };
  }, [inStoreCtx, scope, storageKey]);

  const close = () => { setShow(false); try { localStorage.setItem(storageKey, '1'); } catch { /* ignore */ } };
  const install = async () => {
    if (!deferred) return;
    try { await deferred.prompt(); await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null);
    close();
  };

  if (!show) return null;
  const bg = brand || 'hsl(var(--primary))';

  return (
    <div className="fixed inset-x-0 top-0 z-[200] px-2 pt-[max(0.4rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-2xl items-center gap-2.5 rounded-b-2xl px-3 py-2 text-white shadow-xl ring-1 ring-black/10" style={{ background: bg }}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/20"><Download className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold">ثبّت {scope === 'store' ? `متجر ${name}` : 'تطبيق تربح'} على جهازك</div>
          {ios ? (
            <p className="flex flex-wrap items-center gap-1 text-[11px] opacity-95">اضغط <Share className="inline h-3.5 w-3.5" /> ثم <Plus className="inline h-3.5 w-3.5" /> «إضافة إلى الشاشة الرئيسية».</p>
          ) : (
            <p className="truncate text-[11px] opacity-90">وصول أسرع من سطح المكتب/الشاشة الرئيسية.</p>
          )}
        </div>
        {!ios && (
          <button onClick={install} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-extrabold shadow" style={{ color: bg }}>
            تثبيت
          </button>
        )}
        <button onClick={close} aria-label="إغلاق" className="shrink-0 rounded-lg p-1 text-white/90 hover:bg-white/15"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
