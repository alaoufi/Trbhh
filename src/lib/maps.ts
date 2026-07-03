// Client-safe helpers to extract coordinates from a Google-Maps link/text.
export type LatLng = { lat: number; lng: number };

const clamp = (lat: number, lng: number): LatLng | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;

/**
 * Parse coordinates from a pasted Google-Maps URL or a bare "lat,lng".
 * Handles the common direct forms (@lat,lng · q=/query=/ll= · !3d!4d).
 * Returns null for shortened links (goo.gl) — those need a server redirect.
 */
export function parseMapsUrl(input: string | null | undefined): LatLng | null {
  const s = (input || '').trim();
  if (!s) return null;
  let m = s.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/); // bare lat,lng
  if (m) return clamp(parseFloat(m[1]), parseFloat(m[2]));
  m = s.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/); // .../@lat,lng,z
  if (m) return clamp(parseFloat(m[1]), parseFloat(m[2]));
  m = s.match(/[?&](?:q|query|ll|destination|center|daddr)=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/i); // q=/query=/ll=
  if (m) return clamp(parseFloat(m[1]), parseFloat(m[2]));
  m = s.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/); // place data
  if (m) return clamp(parseFloat(m[1]), parseFloat(m[2]));
  return null;
}
