import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma',()=>({prisma:{ads:{findMany:vi.fn()},stores:{findMany:vi.fn()},store_products:{findMany:vi.fn()}}}));

import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { previewRobotsHeader } from '@/lib/read-only-preview';

afterEach(()=>vi.unstubAllEnvs());

describe('preview search-engine isolation',()=>{
  it('returns a strict robots policy and header only in read-only preview',async()=>{
    vi.stubEnv('TRBHH_READ_ONLY_PREVIEW','1');
    expect(previewRobotsHeader()).toBe('noindex, nofollow, noarchive');
    expect(robots()).toEqual({rules:{userAgent:'*',disallow:'/'}});
    await expect(sitemap()).resolves.toEqual([]);
  });

  it('keeps production robots indexable',()=>{
    vi.stubEnv('TRBHH_READ_ONLY_PREVIEW','0');
    expect(previewRobotsHeader()).toBeNull();
    expect(robots()).toMatchObject({rules:{userAgent:'*',allow:'/'}});
  });
});
