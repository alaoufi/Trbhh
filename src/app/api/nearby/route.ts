import { NextResponse } from 'next/server';
import { normalizeOptionalCoordinates } from '@/lib/ads/submission-validation';
import { getNearbyAdsByCoordinates } from '@/lib/data';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

export async function POST(request: Request) {
  try {
    const body = await request.json() as { lat?: unknown; lng?: unknown };
    const coordinates = normalizeOptionalCoordinates(body);
    if (!coordinates) return NextResponse.json({ error: 'invalid_location' }, { status: 400, headers });
    const items = await getNearbyAdsByCoordinates({ lat: Number(coordinates.lat), lng: Number(coordinates.lng) });
    return NextResponse.json({ items }, { headers });
  } catch {
    return NextResponse.json({ error: 'nearby_unavailable' }, { status: 400, headers });
  }
}
