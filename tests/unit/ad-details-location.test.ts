import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDistanceAr, haversineKm, parseLatLng } from '@/lib/geo';

describe('private advertisement distance UX', () => {
  it('calculates and formats realistic Haversine distances', () => {
    const km = haversineKm({ lat: 24.7136, lng: 46.6753 }, { lat: 24.7743, lng: 46.7386 });
    expect(km).toBeGreaterThan(8);
    expect(km).toBeLessThan(10);
    expect(formatDistanceAr(km)).toBe('يبعد عنك تقريبًا 9.3 كم');
  });

  it('uses readable approximate rounding without exposing coordinates', () => {
    expect(formatDistanceAr(0.34)).toBe('يبعد عنك تقريبًا 340 م');
    expect(formatDistanceAr(3.24)).toBe('يبعد عنك تقريبًا 3.2 كم');
    expect(formatDistanceAr(72.4)).toBe('يبعد عنك تقريبًا 72 كم');
  });

  it.each(['24x,46y', '24,46,7', '24.7foo,46.6', '24.7,46.6 extra', ',46', '24,'])(
    'strictly rejects malformed stored coordinates %s',
    (value) => expect(parseLatLng(value)).toBeNull(),
  );

  it('accepts only a complete decimal coordinate pair in range', () => {
    expect(parseLatLng(' 24.713612 , 46.675312 ')).toEqual({ lat: 24.713612, lng: 46.675312 });
    expect(parseLatLng('91,46')).toBeNull();
    expect(parseLatLng('24,181')).toBeNull();
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
