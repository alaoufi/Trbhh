import {afterEach,describe,expect,it,vi} from 'vitest';
import {translateArabicCjSearch} from '@/lib/cj/search';

afterEach(()=>vi.unstubAllGlobals());

describe('CJ Arabic catalog search',()=>{
  it('converts an Arabic product name to the source-language term CJ indexes',async()=>{
    const fetcher=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({responseStatus:200,responseData:{translatedText:'diamond ring'}}),{status:200}));
    vi.stubGlobal('fetch',fetcher);
    await expect(translateArabicCjSearch('خاتم ألماس')).resolves.toBe('diamond ring');
    // يُجرَّب مزوّد ar→en؛ لا نقيّد الترتيب أو المزوّد، لكن لا بد أن أحد النداءات طلب الاتجاه ar→en.
    const calledArToEn=fetcher.mock.calls.some(c=>{const u=String(c[0]);const b=String((c[1] as RequestInit|undefined)?.body??'');return /langpair=ar(%7C|\|)en/i.test(u)||/\bsl=ar\b/i.test(u)||/"source"\s*:\s*"ar"/i.test(b)||/source_lang=AR/i.test(b);});
    expect(calledArToEn).toBe(true);
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
