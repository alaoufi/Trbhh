import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { formatDistanceAr, haversineKm, parseLatLng } from '@/lib/geo';
import { normalizeOptionalCoordinates } from '@/lib/ads/submission-validation';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'not_found' }, { status: 404, headers });

  let visitor;
  try {
    const body = await request.json() as { lat?: unknown; lng?: unknown };
    visitor = normalizeOptionalCoordinates({ lat: body.lat, lng: body.lng });
    if (!visitor) throw new Error('missing');
  } catch {
    return NextResponse.json({ error: 'invalid_location' }, { status: 400, headers });
  }

  const ad = await prisma.ads.findFirst({
    where: {
      id: BigInt(id), status: 1, state: 'active',
      AND: [{ OR: [{ store_only: 0 }, { trbhh_until: { gt: new Date() } }] }],
    },
    select: { lat: true, lng: true, user_id: true },
  }).catch(() => null);
  if (!ad) return NextResponse.json({ error: 'not_found' }, { status: 404, headers });
  const seller = await prisma.users.findUnique({ where: { id: ad.user_id }, select: { ban: true } }).catch(() => null);
  if (seller?.ban === 'checked') return NextResponse.json({ error: 'not_found' }, { status: 404, headers });

  const destination = parseLatLng(ad.lat && ad.lng ? `${ad.lat},${ad.lng}` : null);
  if (!destination) return NextResponse.json({ error: 'location_unavailable' }, { status: 404, headers });
  const distanceKm = haversineKm({ lat: Number(visitor.lat), lng: Number(visitor.lng) }, destination);
  return NextResponse.json({ label: formatDistanceAr(distanceKm) }, { headers });
}
