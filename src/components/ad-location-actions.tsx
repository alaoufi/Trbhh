'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import {
  readCoordinatesWhenPermissionGranted,
  readSessionCoordinates,
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
    if (saved) {
      void calculate(saved);
      return;
    }
    if (typeof navigator === 'undefined') return;
    void readCoordinatesWhenPermissionGranted({
      geolocation: navigator.geolocation,
      permissions: navigator.permissions,
    }).then((coordinates) => {
      if (!coordinates) return;
      saveSessionCoordinates(sessionStorage, coordinates);
      void calculate(coordinates);
    });
  }, [calculate]);

  if (!directionsUrl && !distance && !busy && !error) return null;

  return (
    <div className="card-3d rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary"><MapPin className="h-4 w-4" /> موقع الإعلان</div>
      {distance && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-primary/5 p-2.5 text-sm font-bold text-primary">
          <Navigation className="h-4 w-4 shrink-0" /> {distance}
        </div>
      )}
      {busy && !distance && <p className="mb-3 text-xs font-medium text-muted-foreground">جارٍ حساب المسافة…</p>}
      {error && <p role="status" className="mb-3 text-xs font-medium text-amber-800">{error}</p>}
      {directionsUrl && (
        <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white hover:bg-primary/90">
          <Navigation className="h-5 w-5" /> الاتجاهات إلى الموقع
        </a>
      )}
    </div>
  );
}
