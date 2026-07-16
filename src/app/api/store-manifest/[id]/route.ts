import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getStore } from '@/lib/stores';
import { getStoreMeta, storeIdByHandle } from '@/lib/merchant';
import { SITE } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const iconType = (url: string) => {
  const u = url.toLowerCase();
  if (u.endsWith('.svg')) return 'image/svg+xml';
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
  if (u.endsWith('.webp')) return 'image/webp';
  return 'image/png';
};

/**
 * Per-store PWA manifest — lets each store be installed as its OWN app (name,
 * logo, brand color). The storefront links this via `metadata.manifest`. Scope
 * adapts to how the store is opened: the subdomain root (/) or the path
 * (/companies/[id]) on the main domain.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const storeId = /^\d+$/.test(id) ? Number(id) : await storeIdByHandle(id);
  const s = storeId ? await getStore(storeId) : null;
  if (!s) return NextResponse.json({}, { status: 404 });
  const meta = await getStoreMeta(storeId);
  const name = (meta.storeName || s.name || 'متجر').slice(0, 45);
  const brand = /^#[0-9a-fA-F]{6}$/.test(meta.color || '') ? (meta.color as string) : '#3287da';

  const host = (req.headers.get('host') || SITE.domain).toLowerCase();
  const isSub = host.endsWith('.' + SITE.domain) && host !== SITE.domain && !host.startsWith('www.');
  const start = isSub ? '/' : `/companies/${storeId}`;

  const rawLogo = s.logo && !s.logo.endsWith('placeholder-ad.svg') ? s.logo : '';
  const base = `https://${SITE.domain}`;
  const logoAbs = rawLogo ? (rawLogo.startsWith('http') ? rawLogo : `${base}${rawLogo.startsWith('/') ? '' : '/'}${rawLogo}`) : '';
  // نضمن دائماً أيقونات PNG صالحة (ٱلمنصّة) لتكتمل قابلية التثبيت، ونضع شعار المتجر أولاً كأيقونة مُفضّلة.
  const icons: { src: string; sizes: string; type: string; purpose: string }[] = [];
  if (logoAbs) icons.push({ src: logoAbs, sizes: '512x512', type: iconType(logoAbs), purpose: 'any' });
  icons.push(
    { src: `${base}/icon-192.png?v=2`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `${base}/icon-512.png?v=2`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: `${base}/icon-maskable-512.png?v=2`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  );
  const manifest = {
    id: start,
    name,
    short_name: name.slice(0, 12),
    description: (meta.tagline || meta.about || `متجر ${name}`).replace(/\s+/g, ' ').trim().slice(0, 140),
    start_url: start,
    scope: start,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: brand,
    lang: 'ar',
    dir: 'rtl',
    icons,
  };
  return NextResponse.json(manifest, {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}
