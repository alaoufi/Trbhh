'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin, Navigation } from 'lucide-react';
import type { AdCard } from '@/lib/data';
import { compactAdTitle } from '@/lib/ad-presentation';
import {
  BrowserGeolocationError,
  geolocationErrorMessage,
  readSessionCoordinates,
  requestCurrentCoordinates,
  saveSessionCoordinates,
  type BrowserCoordinates,
} from '@/lib/geolocation-client';

export function NearbyGpsResults() {
  const [items, setItems] = useState<AdCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (coordinates: BrowserCoordinates) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coordinates),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('nearby');
      const result = await response.json() as { items?: AdCard[] };
      setItems(result.items || []);
    } catch {
      setError('تعذر تحميل الإعلانات الأقرب الآن. يمكنك متابعة التصفح حسب المنطقة والمدينة.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const saved = readSessionCoordinates(sessionStorage);
    if (saved) void load(saved);
  }, [load]);

  async function enableNearby() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError(geolocationErrorMessage(2));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const coordinates = await requestCurrentCoordinates(navigator.geolocation);
      saveSessionCoordinates(sessionStorage, coordinates);
      await load(coordinates);
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof BrowserGeolocationError ? caught.message : geolocationErrorMessage(2));
    }
  }

  return (
    <section className="card-3d space-y-3 rounded-xl p-3" aria-labelledby="gps-nearby-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="gps-nearby-heading" className="flex items-center gap-2 text-sm font-extrabold text-primary"><Navigation className="h-4 w-4" /> الأقرب إلى موقعك الفعلي</h2>
          <p className="mt-1 text-xs text-muted-foreground">اضغط الزر لإظهار المسافة بالكيلومتر. موقعك اختياري ويُستخدم لهذه الجلسة فقط ولا يُحفظ في حسابك.</p>
        </div>
        <button type="button" onClick={enableNearby} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {busy ? 'جارٍ التحديد…' : items ? 'تحديث موقعي' : 'عرض الأقرب لموقعي'}
        </button>
      </div>
      {error && <p role="status" className="rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-900">{error}</p>}
      {items && items.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">لا توجد إعلانات بإحداثيات صالحة قريبة لعرضها الآن.</p>}
      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((ad) => (
            <Link key={ad.id} href={`/ads/${ad.id}`} className="flex gap-3 rounded-xl border border-primary/15 bg-white p-2.5 hover:border-primary/40">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100"><Image src={ad.image} alt={compactAdTitle(ad.title)} fill sizes="80px" className="object-cover" /></div>
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-sm font-bold text-primary">{compactAdTitle(ad.title)}</h3>
                {ad.cityName && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{ad.cityName}</p>}
                {ad.distanceLabel && <p className="mt-1 text-xs font-extrabold text-emerald-700">{ad.distanceLabel}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
