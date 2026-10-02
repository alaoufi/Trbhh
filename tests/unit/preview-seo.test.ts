import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma',()=>({prisma:{ads:{findMany:vi.fn()},stores:{findMany:vi.fn()},store_products:{findMany:vi.fn()}}}));

import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { previewRobotsHeader } from '@/lib/read-only-preview';
import {readFileSync} from 'node:fs';

afterEach(()=>vi.unstubAllEnvs());

describe('preview search-engine isolation',()=>{
  it('also marks rendered metadata as noindex in preview mode',()=>{
    const layout=readFileSync('src/app/layout.tsx','utf8');
    expect(layout).toContain('robots: isPreviewDeployment()');
    expect(layout).toContain('{ index: false, follow: false, noarchive: true }');
  });
  it('returns a strict robots policy and header for every staging preview',async()=>{
    vi.stubEnv('TRBHH_PREVIEW_MODE','1');
    vi.stubEnv('TRBHH_READ_ONLY_PREVIEW','0');
    expect(previewRobotsHeader()).toBe('noindex, nofollow, noarchive');
    expect(robots()).toEqual({rules:{userAgent:'*',disallow:'/'}});
    await expect(sitemap()).resolves.toEqual([]);
  });

  it('keeps preview SEO isolation independent from database write mode',async()=>{
    vi.stubEnv('TRBHH_PREVIEW_MODE','0');
    vi.stubEnv('TRBHH_READ_ONLY_PREVIEW','1');
    expect(previewRobotsHeader()).toBeNull();
    expect(robots()).toMatchObject({rules:{userAgent:'*',allow:'/'}});
    vi.stubEnv('TRBHH_PREVIEW_MODE','1');
    expect(previewRobotsHeader()).toBe('noindex, nofollow, noarchive');
    await expect(sitemap()).resolves.toEqual([]);
  });
});
