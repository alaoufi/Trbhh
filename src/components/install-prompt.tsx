'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download, X, Share, Plus } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'trbhh_install_dismissed';

/**
 * لافتة "ثبّت تطبيق تربح على جهازك" — تظهر عند الدخول لمن لم يثبّت الموقع بعد.
 * تستخدم حدث beforeinstallprompt (كروم/إيدج/أندرويد) للتثبيت بنقرة، وتعرض
 * إرشادات يدوية على iOS/سفاري. تُخفى بعد التثبيت أو الإغلاق، ولا تظهر داخل
 * المتاجر المستقلة (/companies، /store).
 */
export function InstallPrompt() {
  const pathname = usePathname() || '';
  const inStoreCtx = /^\/companies\//.test(pathname) || /^\/store(\/|$|-)/.test(pathname);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (inStoreCtx) return;
    // مثبّت مسبقاً؟ لا تعرض
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    try { if (localStorage.getItem(DISMISS_KEY) === '1') return; } catch { /* ignore */ }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS/سفاري لا يدعم beforeinstallprompt → إرشادات يدوية
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosSafari = /iphone|ipad|ipod/.test(ua) && /safari/.test(ua) && !/crios|fxios/.test(ua);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (isIosSafari) {
      t = setTimeout(() => { setIos(true); setShow(true); }, 2500);
    }

    window.addEventListener('appinstalled', () => setShow(false));
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); if (t) clearTimeout(t); };
  }, [inStoreCtx]);

  const close = () => {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch { /* ignore */ }
    setDeferred(null);
    close();
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[150] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:bottom-4 md:right-4 md:left-auto md:px-0">
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-primary/20 bg-card p-3 shadow-2xl md:max-w-sm">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Download className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-primary">ثبّت تطبيق تربح على جهازك</div>
          {ios ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              اضغط <Share className="inline h-3.5 w-3.5" /> «مشاركة» ثم <Plus className="inline h-3.5 w-3.5" /> «إضافة إلى الشاشة الرئيسية».
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">وصول أسرع من سطح المكتب/الشاشة الرئيسية، ويعمل كتطبيق مستقل.</p>
          )}
          {!ios && (
            <button onClick={install} className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary/90">
              <Download className="h-4 w-4" /> تثبيت الآن
            </button>
          )}
        </div>
        <button onClick={close} aria-label="إغلاق" className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-secondary">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
