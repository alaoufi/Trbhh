import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rankNearbyAds } from '@/lib/ads/nearby';

describe('nearby advertisements by precise coordinates', () => {
  it('sorts valid coordinates by Haversine and excludes missing/invalid coordinates', () => {
    const ranked = rankNearbyAds({ lat: 24.7136, lng: 46.6753 }, [
      { id: 1, lat: null, lng: null },
      { id: 2, lat: '24.7743', lng: '46.7386' },
      { id: 3, lat: '24.7140', lng: '46.6760' },
      { id: 4, lat: '999', lng: '46.6' },
    ]);
    expect(ranked.map((item) => item.id)).toEqual([3, 2]);
    expect(ranked[0].distanceKm).toBeGreaterThan(0);
    expect(ranked[0].distanceKm).toBeLessThan(ranked[1].distanceKm);
  });

  it('keeps nearby optional and returns sanitized cards without coordinates', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/app/nearby/page.tsx'), 'utf8');
    const client = readFileSync(resolve(process.cwd(), 'src/components/nearby-gps-results.tsx'), 'utf8');
    const route = readFileSync(resolve(process.cwd(), 'src/app/api/nearby/route.ts'), 'utf8');
    expect(page).toContain('NearbyGpsResults');
    expect(client).toContain('عرض الأقرب لموقعي');
    expect(client).toContain('اضغط الزر لإظهار المسافة بالكيلومتر');
    expect(client).toContain('requestCurrentCoordinates');
    expect(route).toContain('getNearbyAdsByCoordinates');
    expect(route).not.toMatch(/NextResponse\.json\([^)]*(lat|lng)/);
  });

  it('keeps the isolated preview seller contactable through WhatsApp', () => {
    const seed = readFileSync(resolve(process.cwd(), 'scripts/preview/seed.mjs'), 'utf8');
    expect(seed).toContain("seller_whatsapp_on: '1'");
    expect(seed).toMatch(/phone_whatsapp:\s*'0500000001'/);
    expect(seed).toMatch(/whatsapp:\s*1/);
  });
});
