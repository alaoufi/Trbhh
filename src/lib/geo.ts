import { cookies } from 'next/headers';

export type LatLng = { lat: number; lng: number };

/** Parse a "lat,lng" string into numbers, or null if invalid. */
export function parseLatLng(v?: string | null): LatLng | null {
  if (!v) return null;
  const [a, b] = v.split(',');
  const lat = parseFloat(a);
  const lng = parseFloat(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Read the viewer's location from the `trbhh_geo` cookie (set client-side). */
export async function getViewerLocation(): Promise<LatLng | null> {
  const c = (await cookies()).get('trbhh_geo')?.value;
  return parseLatLng(c);
}

/** Great-circle distance in kilometres between two points. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Human, Arabic distance label (e.g. "يبعد عنك ~٣ كم"). */
export function formatDistanceAr(km: number): string {
  const fmt = new Intl.NumberFormat('ar-SA', { maximumFractionDigits: km < 10 ? 1 : 0 });
  if (km < 1) return `يبعد عنك ~${new Intl.NumberFormat('ar-SA').format(Math.round(km * 1000))} م`;
  return `يبعد عنك ~${fmt.format(km)} كم`;
}
