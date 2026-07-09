'use client';
import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';

function b64ToU8(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** بطاقة تفعيل التنبيهات الفورية — تظهر فقط عندما تفعّلها الإدارة ويدعمها الجهاز. */
export function PushToggle() {
  const [state, setState] = useState<'hidden' | 'off' | 'on' | 'busy' | 'denied'>('hidden');
  const [key, setKey] = useState('');

  useEffect(() => {
    (async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
        const r = await fetch('/api/push').then((x) => x.json()).catch(() => null);
        if (!r?.enabled) return;
        setKey(r.key);
        if (Notification.permission === 'denied') { setState('denied'); return; }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub && r.subscribed ? 'on' : 'off');
      } catch { /* unsupported */ }
    })();
  }, []);

  async function enable() {
    setState('busy');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
      const ok = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) }).then((x) => x.ok).catch(() => false);
      setState(ok ? 'on' : 'off');
    } catch { setState('off'); }
  }

  async function disable() {
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState('off');
    } catch { setState('off'); }
  }

  if (state === 'hidden') return null;
  return (
    <div className="card-3d flex items-center gap-3 rounded-xl p-4">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${state === 'on' ? 'bg-emerald-100 text-emerald-700' : 'bg-accent text-accent-foreground'}`}>
        {state === 'on' ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-bold">التنبيهات الفورية</div>
        <div className="text-xs text-muted-foreground">
          {state === 'on' && 'مفعّلة على هذا الجهاز — تصلك الرسائل والتحديثات فور حدوثها.'}
          {state === 'off' && 'فعّلها ليصلك تنبيه فوري بالرسائل الجديدة وقرارات التوثيق والشحن.'}
          {state === 'busy' && 'لحظة…'}
          {state === 'denied' && 'التنبيهات محظورة من إعدادات المتصفح لهذا الموقع — اسمح بها ثم أعد المحاولة.'}
        </div>
      </div>
      {state === 'on' ? (
        <button onClick={disable} className="flex shrink-0 items-center gap-1 rounded-full border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"><BellOff className="h-3.5 w-3.5" /> إيقاف</button>
      ) : state === 'off' ? (
        <button onClick={enable} className="btn-3d shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-bold text-white">تفعيل</button>
      ) : null}
    </div>
  );
}
