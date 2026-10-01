'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import {
  BrowserGeolocationError,
  geolocationErrorMessage,
  readSessionCoordinates,
  requestCurrentCoordinates,
  saveSessionCoordinates,
  type BrowserCoordinates,
} from '@/lib/geolocation-client';

export function AdLocationActions({ adId, directionsUrl }: { adId: number; directionsUrl?: string | null }) {
  const [distance, setDistance] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const calculate = useCallback(async (coordinates: BrowserCoordinates) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/ads/${adId}/distance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coordinates),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('distance');
      const result = await response.json() as { label?: string };
      if (result.label) setDistance(result.label);
    } catch {
      setError('تعذر حساب المسافة الآن. يمكنك متابعة تصفح الإعلان.');
    } finally {
      setBusy(false);
    }
  }, [adId]);

  useEffect(() => {
    const saved = readSessionCoordinates(sessionStorage);
    if (saved) void calculate(saved);
  }, [calculate]);

  async function requestDistance() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError(geolocationErrorMessage(2));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const coordinates = await requestCurrentCoordinates(navigator.geolocation);
      saveSessionCoordinates(sessionStorage, coordinates);
      await calculate(coordinates);
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof BrowserGeolocationError ? caught.message : geolocationErrorMessage(2));
    }
  }

  return (
    <div className="card-3d rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary"><MapPin className="h-4 w-4" /> موقع الإعلان</div>
      {distance ? (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-primary/5 p-2.5 text-sm font-bold text-primary">
          <Navigation className="h-4 w-4 shrink-0" /> {distance}
        </div>
      ) : (
        <button type="button" onClick={requestDistance} disabled={busy} className="mb-3 rounded-xl border-2 border-primary/30 bg-white px-4 py-2 text-sm font-bold text-primary disabled:opacity-60">
          {busy ? 'جارٍ حساب المسافة…' : 'احسب المسافة'}
        </button>
      )}
      {error && <p role="status" className="mb-3 text-xs font-medium text-amber-800">{error}</p>}
      {directionsUrl && (
        <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white hover:bg-primary/90">
          <Navigation className="h-5 w-5" /> الاتجاهات إلى الموقع
        </a>
      )}
    </div>
  );
}
