import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/settings',()=>({getSetting:async(key:string,fallback:string)=>key==='cj_libretranslate_url'?'https://old-external-translator.example':key==='cj_deepl_api_key'?'OLD-KEY':fallback}));
vi.mock('@/lib/prisma',()=>({prisma:{cj_glossary:{findMany:async()=>[]},cj_translations:{findMany:async()=>[]}}}));
import {translateToArabic,translateToArabicForDisplay,translateArabicToEnglish} from '@/lib/cj/translate';
afterEach(()=>vi.unstubAllGlobals());
it('never uses a saved external translator or cloud fallbacks during local outage',async()=>{
 const fetcher=vi.fn(async()=>new Response('offline',{status:503}));vi.stubGlobal('fetch',fetcher);
 expect(await translateToArabic('Cotton shirt')).toBeNull();
 expect(await translateToArabicForDisplay('Cotton shirt')).toBeNull();
 expect(await translateArabicToEnglish('قميص قطني')).toBeNull();
 expect(fetcher).toHaveBeenCalledTimes(3);
 expect(fetcher.mock.calls.every(call=>String((call as unknown[])[0]).startsWith('http://ollama:11434/'))).toBe(true);
});
