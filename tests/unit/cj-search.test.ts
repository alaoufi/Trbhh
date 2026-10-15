import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({queries:vi.fn(),translate:vi.fn(),rows:[] as {source:string;target_ar:string}[]}));
vi.mock('@/lib/ai/local',()=>({localSearchQueries:state.queries}));
vi.mock('@/lib/cj/translate',async(original)=>({...await original<typeof import('@/lib/cj/translate')>(),translateArabicToEnglish:state.translate}));
vi.mock('@/lib/prisma',()=>({prisma:{cj_glossary:{findMany:async()=>state.rows}}}));
import {cjSearchQueries,translateArabicCjSearch} from '@/lib/cj/search';
import {normalizeArabicForSearch} from '@/lib/cj/translate';
beforeEach(()=>{state.rows=[];state.queries.mockReset().mockResolvedValue([]);state.translate.mockReset().mockResolvedValue(null);});
afterEach(()=>vi.unstubAllGlobals());
describe('local intent-aware catalog search',()=>{
 it('normalizes only for matching',()=>{expect(normalizeArabicForSearch('أحمــد')).toBe('احمد');expect(normalizeArabicForSearch('شاشة')).toBe('شاشه');});
 it.each(['اريد أدوات تساعدني في ترتيب المطبخ','أبغى دريل بدون سلك','حذاء للمشي تحت المطر'])('understands general intent for %s through local inference',async(query)=>{
  state.queries.mockResolvedValue(['catalog intent','same intent alternative']);expect(await cjSearchQueries(query)).toEqual(['catalog intent','same intent alternative']);expect(state.queries).toHaveBeenCalledWith(query);
 });
 it('keeps exact SKU identity without model reinterpretation',async()=>{expect(await cjSearchQueries('CJLX324417101AZ')).toEqual(['CJLX324417101AZ']);expect(state.queries).not.toHaveBeenCalled();});
 it('uses local translation if intent model returns no valid alternatives',async()=>{state.translate.mockResolvedValue('diamond ring');expect(await translateArabicCjSearch('خاتم ألماس')).toBe('diamond ring');});
 it('uses exact taught synonyms when the model is unavailable',async()=>{state.rows=[{source:'rain boots',target_ar:'حذاء المطر'}];expect(await cjSearchQueries('حذاء المطر')).toEqual(['rain boots']);});
 it('never drops qualifiers through glossary substring matching',async()=>{state.rows=[{source:'phone',target_ar:'هاتف'}];expect(await cjSearchQueries('غطاء هاتف أحمر')).toEqual([]);});
 it('returns no general catalog query when all local services fail',async()=>{expect(await translateArabicCjSearch('خاتم ألماس')).toBeNull();});
 it('retains English text if local intent service is unavailable',async()=>{expect(await cjSearchQueries('diamond ring')).toEqual(['diamond ring']);});
});
