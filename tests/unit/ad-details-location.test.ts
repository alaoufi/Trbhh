import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDistanceAr, haversineKm } from '@/lib/geo';

describe('private advertisement distance UX', () => {
  it('calculates and formats realistic Haversine distances', () => {
    const km = haversineKm({ lat: 24.7136, lng: 46.6753 }, { lat: 24.7743, lng: 46.7386 });
    expect(km).toBeGreaterThan(8);
    expect(km).toBeLessThan(10);
    expect(formatDistanceAr(km)).toMatch(/^يبعد عنك تقريبًا \d+\.\d كم$/);
  });

  it('does not mount an automatic geolocation prompt or use a persistent geo cookie', () => {
    const layout = readFileSync(resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8');
    const detail = readFileSync(resolve(process.cwd(), 'src/app/ads/[id]/page.tsx'), 'utf8');
    const geo = readFileSync(resolve(process.cwd(), 'src/lib/geo.ts'), 'utf8');
    expect(layout).not.toContain('<GeoPrompt');
    expect(detail).not.toContain('getViewerLocation');
    expect(geo).not.toContain('trbhh_geo');
  });

  it('uses a server distance endpoint and gates directions on exact consent', () => {
    const component = readFileSync(resolve(process.cwd(), 'src/components/ad-location-actions.tsx'), 'utf8');
    const route = readFileSync(resolve(process.cwd(), 'src/app/api/ads/[id]/distance/route.ts'), 'utf8');
    const detail = readFileSync(resolve(process.cwd(), 'src/app/ads/[id]/page.tsx'), 'utf8');
    expect(component).not.toContain('احسب المسافة');
    expect(component).toContain('readCoordinatesWhenPermissionGranted');
    expect(component).toContain('sessionStorage');
    expect(component).toContain('/api/ads/${adId}/distance');
    expect(route).toContain('haversineKm');
    expect(route).not.toContain('INSERT');
    expect(route).not.toContain('UPDATE');
    expect(detail).toContain('showExactLocationPublicly');
    expect(detail).toContain('destination=');
  });
});
