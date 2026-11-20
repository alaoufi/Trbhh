'use client';
import { useEffect } from 'react';

/** ما يسلّمه تطبيق iPhone للصفحة: رمز الجهاز إن سُمح بالإشعارات. */
export type IosPushReply = { granted: boolean; token?: string; sandbox?: boolean };
type NativeHandler = { postMessage: (m: string) => void };
export const IOS_PUSH_OFF_KEY = 'trbhh_apns_off';

/** جسر التطبيق: موجود فقط داخل تطبيق iPhone (نسخة تدعم الإشعارات). */
export function iosPushHandler(): NativeHandler | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { webkit?: { messageHandlers?: { trbhhPush?: NativeHandler } } };
  return w.webkit?.messageHandlers?.trbhhPush || null;
}

/** يسأل التطبيق ويستلم رده مرة واحدة. 'status' لا يُظهر نافذة الإذن، و'register' يُظهرها أول مرة. */
export function askIosPush(kind: 'status' | 'register', timeoutMs = 30_000): Promise<IosPushReply | null> {
  const handler = iosPushHandler();
  if (!handler) return Promise.resolve(null);
  return new Promise((resolve) => {
    const w = window as unknown as { __trbhhPush?: (r: IosPushReply) => void };
    const timer = setTimeout(() => { w.__trbhhPush = undefined; resolve(null); }, timeoutMs);
    w.__trbhhPush = (r) => { clearTimeout(timer); w.__trbhhPush = undefined; resolve(r && typeof r === 'object' ? r : null); };
    try { handler.postMessage(kind); } catch { clearTimeout(timer); resolve(null); }
  });
}

export async function registerIosPush(reply: IosPushReply): Promise<boolean> {
  if (!reply.granted || !reply.token) return false;
  return fetch('/api/push/apns', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: reply.token, sandbox: reply.sandbox === true }) })
    .then((x) => x.ok).catch(() => false);
}

/**
 * يعيد ربط جهاز iPhone بحساب العضو تلقائياً عند فتح التطبيق، إن كان قد سمح بالإشعارات سابقاً
 * (رمز الجهاز قد يتغير، والخروج يفصل الجهاز). لا يُظهر نافذة إذن، ولا يعمل إن أوقفها العضو من بطاقته.
 */
export function IosPushBridge({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    if (!signedIn || !iosPushHandler()) return;
    let cancelled = false;
    (async () => {
      try {
        if (localStorage.getItem(IOS_PUSH_OFF_KEY) === '1') return;
        const reply = await askIosPush('status', 10_000);
        if (cancelled || !reply?.granted || !reply.token) return;
        const mark = `trbhh_apns_sent:${reply.token.slice(0, 16)}`;
        if (sessionStorage.getItem(mark) === '1') return;
        if (await registerIosPush(reply)) sessionStorage.setItem(mark, '1');
      } catch { /* التخزين غير متاح */ }
    })();
    return () => { cancelled = true; };
  }, [signedIn]);
  return null;
}
