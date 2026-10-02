import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  ad: vi.fn(),
  user: vi.fn(),
  nearby: vi.fn(),
  rate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    ads: { findFirst: state.ad },
    users: { findUnique: state.user },
  },
}));
vi.mock('@/lib/data', () => ({ getNearbyAdsByCoordinates: state.nearby }));
vi.mock('@/lib/redis', () => ({ rateHit: state.rate }));

import { POST as distancePost } from '@/app/api/ads/[id]/distance/route';
import { POST as nearbyPost } from '@/app/api/nearby/route';

describe('advertisement location APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.ad.mockResolvedValue({ lat: '24.7743', lng: '46.7386', user_id: 10n });
    state.user.mockResolvedValue({ ban: 'no' });
    state.nearby.mockResolvedValue([{ id: 7, title: 'إعلان قريب', distanceLabel: 'يبعد عنك تقريبًا 1.2 كم' }]);
    state.rate.mockResolvedValue(1);
  });

  it('rejects a one-sided visitor coordinate before querying advertisements', async () => {
    const response = await distancePost(new Request('https://trbhh.test/api/ads/1/distance', {
      method: 'POST', body: JSON.stringify({ lat: 24.7 }),
    }), { params: Promise.resolve({ id: '1' }) });
    expect(response.status).toBe(400);
    expect(state.ad).not.toHaveBeenCalled();
  });

  it('returns only a formatted distance and never destination coordinates', async () => {
    const response = await distancePost(new Request('https://trbhh.test/api/ads/1/distance', {
      method: 'POST', body: JSON.stringify({ lat: 24.7136, lng: 46.6753 }),
    }), { params: Promise.resolve({ id: '1' }) });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.label).toBe('يبعد عنك تقريبًا 9.3 كم');
    expect(payload).not.toHaveProperty('lat');
    expect(payload).not.toHaveProperty('lng');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rate limits anonymous distance probes before reading private advertisement coordinates', async () => {
    state.rate.mockResolvedValue(7);
    const response = await distancePost(new Request('https://trbhh.test/api/ads/1/distance', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.17', 'user-agent': 'location-test' },
      body: JSON.stringify({ lat: 24.7136, lng: 46.6753 }),
    }), { params: Promise.resolve({ id: '1' }) });
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('600');
    expect(state.ad).not.toHaveBeenCalled();
    expect(state.rate).toHaveBeenCalledWith(expect.stringMatching(/^ad-distance:[a-f0-9]{64}$/), 600);
  });

  it('applies a per-ad global ceiling before querying private coordinates',async()=>{
    state.rate.mockResolvedValueOnce(121);
    const response=await distancePost(new Request('https://trbhh.test/api/ads/1/distance',{
      method:'POST',body:JSON.stringify({lat:24.7,lng:46.7}),
    }),{params:Promise.resolve({id:'1'})});
    expect(response.status).toBe(429);
    expect(state.rate).toHaveBeenCalledTimes(1);
    expect(state.rate).toHaveBeenCalledWith('ad-distance:global:1',600);
    expect(state.ad).not.toHaveBeenCalled();
  });

  it('passes valid visitor coordinates to nearby discovery without persisting them', async () => {
    const response = await nearbyPost(new Request('https://trbhh.test/api/nearby', {
      method: 'POST', body: JSON.stringify({ lat: 24.7136, lng: 46.6753 }),
    }));
    expect(response.status).toBe(200);
    expect(state.nearby).toHaveBeenCalledWith({ lat: 24.7136, lng: 46.6753 });
    expect(await response.json()).toEqual({ items: [{ id: 7, title: 'إعلان قريب', distanceLabel: 'يبعد عنك تقريبًا 1.2 كم' }] });
  });
});
