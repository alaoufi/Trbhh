import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({find:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{short_links:{findFirst:state.find}}}));
import {GET} from '@/app/[code]/route';

describe('legacy short-link route',()=>{
  beforeEach(()=>vi.clearAllMocks());
  it('returns a real 404 for an unknown one-segment route',async()=>{
    state.find.mockResolvedValue(null);
    const response=await GET(new Request('https://preview.example/unknown-route'),{params:Promise.resolve({code:'unknown-route'})});
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('redirects a known legacy short link only within the current origin',async()=>{
    state.find.mockResolvedValue({route:'ads/77'});
    const response=await GET(new Request('https://preview.example/old'),{params:Promise.resolve({code:'old'})});
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://preview.example/ads/77');
  });
});
