import { haversineKm, parseLatLng, type LatLng } from '@/lib/geo';

export type CoordinateAd = { id: number; lat: string | null; lng: string | null };

/** Invalid/missing coordinate rows never receive a synthetic distance. */
export function rankNearbyAds<T extends CoordinateAd>(visitor: LatLng, rows: T[]): Array<T & { distanceKm: number }> {
  return rows.flatMap((row) => {
    const location = parseLatLng(row.lat && row.lng ? `${row.lat},${row.lng}` : null);
    return location ? [{ ...row, distanceKm: haversineKm(visitor, location) }] : [];
  }).sort((a, b) => a.distanceKm - b.distanceKm || a.id - b.id);
}
