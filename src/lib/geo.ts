export type LatLng = { lat: number; lng: number };

/** Parse a "lat,lng" string into numbers, or null if invalid. */
export function parseLatLng(v?: string | null): LatLng | null {
  if (!v) return null;
  const parts = v.split(',');
  if (parts.length !== 2) return null;
  const [a, b] = parts.map((part) => part.trim());
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (!a || !b || !decimal.test(a) || !decimal.test(b)) return null;
  const lat = Number(a);
  const lng = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
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

/** Human, Arabic distance label without implying false precision. */
export function formatDistanceAr(km: number): string {
  const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: km < 10 ? 1 : 0 });
  if (km < 1) return `يبعد عنك تقريبًا ${new Intl.NumberFormat('en-US').format(Math.round(km * 1000))} م`;
  return `يبعد عنك تقريبًا ${fmt.format(km)} كم`;
}
