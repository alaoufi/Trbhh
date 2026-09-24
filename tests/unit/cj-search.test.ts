import {afterEach,describe,expect,it,vi} from 'vitest';
import {translateArabicCjSearch} from '@/lib/cj/search';

afterEach(()=>vi.unstubAllGlobals());

describe('CJ Arabic catalog search',()=>{
  it('converts an Arabic product name to the source-language term CJ indexes',async()=>{
    const fetcher=vi.fn(async(_input:RequestInfo|URL)=>new Response(JSON.stringify({responseStatus:200,responseData:{translatedText:'diamond ring'}}),{status:200}));
    vi.stubGlobal('fetch',fetcher);
    await expect(translateArabicCjSearch('خاتم ألماس')).resolves.toBe('diamond ring');
    expect(String(fetcher.mock.calls[0][0])).toContain('langpair=ar%7Cen');
  });

  it('passes through a query already written in the source language without a network request',async()=>{
    const fetcher=vi.fn(async(_input:RequestInfo|URL)=>new Response('{}',{status:200}));vi.stubGlobal('fetch',fetcher);
    await expect(translateArabicCjSearch('diamond ring')).resolves.toBe('diamond ring');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns null when translation providers fail instead of searching a fabricated term',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(_input:RequestInfo|URL)=>new Response('unavailable',{status:503})));
    await expect(translateArabicCjSearch('خاتم ألماس')).resolves.toBeNull();
  });
});
