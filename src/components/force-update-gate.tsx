'use client';
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

type Shell = { os: 'android' | 'ios'; v: number };
const KEY = 'trbhh_shell';

/**
 * Force-update gate for the native app shells (إجباري التحديث).
 * The Android TWA / iOS wrapper launch the site with ?app=<os>&v=<code>;
 * we persist that identity, then check /api/app-version on every visit.
 * A shell older than the admin-set minimum gets a fullscreen, non-dismissable
 * overlay pointing to the store — the old version simply cannot be used.
 * Plain web/PWA visitors are never affected.
 */
export function ForceUpdateGate() {
  const [storeUrl, setStoreUrl] = useState<string | null>(null);

  useEffect(() => {
    let shell: Shell | null = null;
    try {
      const q = new URLSearchParams(window.location.search);
      const os = q.get('app');
      const v = parseInt(q.get('v') || '', 10);
      if ((os === 'android' || os === 'ios') && Number.isFinite(v)) {
        shell = { os, v };
        localStorage.setItem(KEY, JSON.stringify(shell));
      } else {
        const saved = localStorage.getItem(KEY);
        if (saved) shell = JSON.parse(saved) as Shell;
      }
    } catch {
      /* storage unavailable → treat as plain web */
    }
    if (!shell) return;
    const { os, v } = shell;
    fetch('/api/app-version')
      .then((r) => r.json())
      .then((cfg) => {
        const min = os === 'android' ? Number(cfg?.android?.minCode) : Number(cfg?.ios?.minBuild);
        const url = os === 'android' ? cfg?.android?.storeUrl : cfg?.ios?.storeUrl;
        if (Number.isFinite(min) && v < min) setStoreUrl(String(url || '#'));
      })
      .catch(() => { /* network hiccup → don't lock the user out */ });
  }, []);

  if (!storeUrl) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-[#3287da] to-[#16213b] p-8 text-center text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/apple-icon.png" alt="تربح" className="h-24 w-24 rounded-3xl bg-white p-2 shadow-2xl" />
      <div>
        <h1 className="text-2xl font-extrabold drop-shadow">تحديث إجباري</h1>
        <p className="mt-2 max-w-sm text-sm leading-7 text-white/90">
          نسخة التطبيق لديك قديمة ولم تعد مدعومة. حدّث الآن من المتجر للمتابعة —
          التحديث مجاني ويستغرق لحظات.
        </p>
      </div>
      <a
        href={storeUrl}
        className="flex items-center gap-2 rounded-2xl bg-white px-8 py-3.5 text-base font-extrabold text-[#1b4f8a] shadow-xl transition hover:scale-[1.02]"
      >
        <RefreshCw className="h-5 w-5" /> تحديث الآن
      </a>
    </div>
  );
}
