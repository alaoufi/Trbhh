'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, X } from 'lucide-react';

/**
 * On first visit, offer to enable location so we can show the distance
 * between the visitor and each ad. Stores "lat,lng" in the `trbhh_geo`
 * cookie (readable server-side). Geolocation needs a secure context (HTTPS).
 */
export function GeoPrompt() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hasCookie = document.cookie.includes('trbhh_geo=');
    const dismissed = localStorage.getItem('geo_dismissed') === '1';
    if (!hasCookie && !dismissed && typeof navigator !== 'undefined' && navigator.geolocation) {
      setShow(true);
    }
  }, []);

  function enable() {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const val = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
        document.cookie = `trbhh_geo=${val}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
        setShow(false);
        setBusy(false);
        router.refresh();
      },
      () => {
        localStorage.setItem('geo_dismissed', '1');
        setShow(false);
        setBusy(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  function dismiss() {
    localStorage.setItem('geo_dismissed', '1');
    setShow(false);
  }

  if (!show) return null;
  return (
    <div className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-primary/30 bg-card p-3 shadow-lg md:bottom-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <MapPin className="h-5 w-5" />
      </span>
      <p className="flex-1 text-xs text-foreground/90">فعّل موقعك لعرض المسافة بينك وبين الإعلانات القريبة.</p>
      <button onClick={enable} disabled={busy} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
        {busy ? '...' : 'تفعيل'}
      </button>
      <button onClick={dismiss} aria-label="إغلاق" className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
