import {createHash} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const db=vi.hoisted(()=>({findMany:vi.fn(),upsert:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{cj_translations:db}}));
import {getCachedArabic,isArabicText,learnTranslation,translateManyCached,translateToArabic,translateToArabicCached} from '@/lib/cj/translate';

const fetchMock=vi.fn();let clock=Date.now();
const cache=new Map<string,string>();
const legacyKey=(s:string)=>createHash('sha1').update('en:ar:'+s.slice(0,480)).digest('hex');
const memory=(translatedText:string)=>new Response(JSON.stringify({responseStatus:200,responseData:{translatedText}}),{status:200});
type CacheWrite={where:{source_key:string};create:{source_key:string;target_ar:string};update:{target_ar?:string}};
function persist(arg:CacheWrite){
  const key=arg.where.source_key;
  if(!cache.has(key))cache.set(key,arg.create.target_ar);
  else if(arg.update.target_ar!==undefined)cache.set(key,arg.update.target_ar);
  return{source_key:key,target_ar:cache.get(key)};
}
beforeEach(()=>{
  vi.clearAllMocks();clock+=100000;vi.spyOn(Date,'now').mockImplementation(()=>clock+=400);
  cache.clear();
  db.findMany.mockImplementation(async(arg:{where:{source_key:{in:string[]}}})=>arg.where.source_key.in.filter(key=>cache.has(key)).map(key=>({source_key:key,target_ar:cache.get(key)!})));
  db.upsert.mockImplementation(async(arg:CacheWrite)=>persist(arg));
  fetchMock.mockReset();fetchMock.mockImplementation(async()=>memory('ترجمة عربية مكتملة'));
  vi.stubGlobal('fetch',fetchMock);
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('CJ Arabic translation integrity',()=>{
  it('passes through fully Arabic text without a provider request',async()=>{
    expect(await translateToArabic('  قميص قطني 2026  ')).toBe('قميص قطني 2026');expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['آلة FlashLabel الحرارية لطباعة الملصقات من Kupono','واجهة USB','XL','2XL'])('preserves a localized name or technical identity %s',async text=>{
    expect(isArabicText(text)).toBe(true);expect(await translateToArabic(text)).toBe(text);expect(fetchMock).not.toHaveBeenCalled();
  });
  it('preserves an explicit Arabic manual correction containing brand and technical tokens',async()=>{
    const target='آلة FlashLabel الحرارية من Kupono بواجهة USB';
    await learnTranslation('Original printer',target);expect(db.upsert.mock.calls[0][0].update).toEqual({target_ar:target});
    expect(await translateToArabicCached('Original printer')).toBe(target);expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not call one Arabic letter plus English prose a localized title',()=>{
    expect(isArabicText('ب FlashLabel Summer Thermal Label Printer')).toBe(false);expect(isArabicText('قميص cotton summer shirt for daily use')).toBe(false);
  });
  it('translates mixed Arabic-English source instead of accepting one Arabic character as completion',async()=>{
    expect(await translateToArabic('قميص Summer Cotton Shirt')).toBe('ترجمة عربية مكتملة');expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('rejects provider output that is English or retains untranslated English prose',async()=>{
    fetchMock.mockImplementation(async(url:string)=>url.includes('mymemory')?memory('قميص Summer Cotton Shirt'):new Response(JSON.stringify([[['Summer Cotton Shirt','source']]])));
    expect(await translateToArabicCached('Summer Cotton Shirt')).toBeNull();expect(db.upsert).not.toHaveBeenCalled();
  });
  it('tries the fallback when the first provider returns an untranslated English result',async()=>{
    fetchMock.mockImplementation(async(url:string)=>url.includes('mymemory')?memory('Summer shirt'):new Response(JSON.stringify([[['قميص صيفي','Summer shirt']]])));
    expect(await translateToArabic('Summer shirt')).toBe('قميص صيفي');expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('translates every character of a long source using bounded requests',async()=>{
    const source=('Detailed cotton shirt specification '.repeat(22)+'UNIQUE END').trim();
    const result=await translateToArabic(source);
    expect(result).not.toBeNull();expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    const chunks=fetchMock.mock.calls.map(([url])=>new URL(url).searchParams.get('q')!);
    expect(chunks.join('')).toBe(source);expect(chunks.every(chunk=>Buffer.byteLength(chunk,'utf8')<=480)).toBe(true);
  });
  it('bounds multibyte source chunks by UTF8 bytes without losing text',async()=>{
    const source='منتج '.repeat(120)+'English description';
    expect(await translateToArabic(source)).not.toBeNull();
    const chunks=fetchMock.mock.calls.map(([url])=>new URL(url).searchParams.get('q')!);
    expect(chunks.join('')).toBe(source.trim());expect(chunks.every(chunk=>Buffer.byteLength(chunk,'utf8')<=480)).toBe(true);
  });
  it('never caches a partial translation when a later source chunk fails',async()=>{
    let calls=0;fetchMock.mockImplementation(async()=>++calls===1?memory('جزء أول'):new Response('{}',{status:503}));
    expect(await translateToArabicCached('long source '.repeat(90))).toBeNull();expect(db.upsert).not.toHaveBeenCalled();
  });
  it('stops at the overall deadline without fallback, later chunks or partial cache writes',async()=>{
    fetchMock.mockImplementation(async()=>{clock+=26000;return memory('Untranslated original');});
    expect(await translateToArabicCached('large description '.repeat(100))).toBeNull();expect(fetchMock).toHaveBeenCalledOnce();expect(db.upsert).not.toHaveBeenCalled();
  });
  it('rejects oversized translation and manual-cache inputs without truncating them',async()=>{
    expect(await translateToArabic('x'.repeat(20001))).toBeNull();await learnTranslation('x'.repeat(20001),'تصحيح عربي');
    expect(fetchMock).not.toHaveBeenCalled();expect(db.upsert).not.toHaveBeenCalled();
  });
  it('keeps distinct full-source keys for descriptions sharing their first480 characters',async()=>{
    const prefix='x'.repeat(480);await learnTranslation(prefix+' first','التصحيح الأول');await learnTranslation(prefix+' second','التصحيح الثاني');
    const keys=db.upsert.mock.calls.map(([arg])=>arg.where.source_key);
    expect(new Set(keys).size).toBe(2);expect(keys).not.toContain(legacyKey(prefix));
  });
  it('does not treat an ambiguous legacy long-prefix cache as the full description',async()=>{
    const source='x'.repeat(480)+'different ending';
    db.findMany.mockResolvedValue([{source_key:legacyKey(source),target_ar:'ترجمة قديمة مبتورة'}]);
    expect((await getCachedArabic([source])).has(source)).toBe(false);
    const keys=db.findMany.mock.calls[0][0].where.source_key.in;expect(keys).not.toContain(legacyKey(source));expect(db.upsert).not.toHaveBeenCalled();
  });
  it('continues using existing exact short-source manual cache without overwriting it',async()=>{
    cache.set(legacyKey('Cotton shirt'),'تصحيح الموظف');
    expect(await translateToArabicCached('Cotton shirt')).toBe('تصحيح الموظف');
    expect(db.findMany.mock.calls[0][0].where.source_key.in).toContain(legacyKey('Cotton shirt'));
    expect(fetchMock).not.toHaveBeenCalled();expect(db.upsert).not.toHaveBeenCalled();
  });
  it('read-only cache reads include mixed sources and ignore invalid English cache output',async()=>{
    const mixed='قميص Cotton shirt',english='Summer shirt';
    db.findMany.mockResolvedValue([{source_key:legacyKey(mixed),target_ar:'قميص قطني'},{source_key:legacyKey(english),target_ar:'Summer shirt'}]);
    expect(await getCachedArabic([mixed,english])).toEqual(new Map([[mixed,'قميص قطني']]));expect(fetchMock).not.toHaveBeenCalled();expect(db.upsert).not.toHaveBeenCalled();
  });
  it.each(['Untranslated original','قميص Summer Cotton Shirt'])('repairs invalid legacy output %s through a separate readable automatic key',async invalid=>{
    cache.set(legacyKey('Cotton shirt'),invalid);
    expect(await translateToArabicCached('Cotton shirt')).toBe('ترجمة عربية مكتملة');
    expect(db.upsert.mock.calls[0][0].update).toEqual({});
    expect(db.upsert.mock.calls[0][0].where.source_key).not.toBe(legacyKey('Cotton shirt'));
    expect(cache.get(legacyKey('Cotton shirt'))).toBe(invalid);
    expect((await getCachedArabic(['Cotton shirt'])).get('Cotton shirt')).toBe('ترجمة عربية مكتملة');
    expect(await translateToArabicCached('Cotton shirt')).toBe('ترجمة عربية مكتملة');expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('uses a later manual correction before an existing automatic result',async()=>{
    expect(await translateToArabicCached('Cotton shirt')).toBe('ترجمة عربية مكتملة');
    await learnTranslation('Cotton shirt','تصحيح الموظف');
    expect((await getCachedArabic(['Cotton shirt'])).get('Cotton shirt')).toBe('تصحيح الموظف');
    expect(await translateToArabicCached('Cotton shirt')).toBe('تصحيح الموظف');expect(fetchMock).toHaveBeenCalledOnce();
    expect(cache.size).toBe(2);
  });
  it('makes a batch repair readable on the next GET while retaining every invalid legacy row',async()=>{
    const invalid=new Map([['Cotton shirt','Untranslated original'],['Summer shirt','قميص Summer Cotton Shirt']]);
    for(const [source,target]of invalid)cache.set(legacyKey(source),target);
    expect(await translateManyCached([...invalid.keys()],2)).toEqual(new Map([...invalid.keys()].map(source=>[source,'ترجمة عربية مكتملة'])));
    expect(await getCachedArabic([...invalid.keys()])).toEqual(new Map([...invalid.keys()].map(source=>[source,'ترجمة عربية مكتملة'])));
    for(const [source,target]of invalid)expect(cache.get(legacyKey(source))).toBe(target);
    expect(db.upsert.mock.calls.every(([arg])=>Object.keys(arg.update).length===0)).toBe(true);
  });
  it('returns and preserves a manual correction written during automatic persistence',async()=>{
    db.upsert.mockImplementation(async(arg:CacheWrite)=>{
      cache.set(legacyKey('Cotton shirt'),'تصحيح يدوي متزامن');
      return persist(arg);
    });
    expect(await translateToArabicCached('Cotton shirt')).toBe('تصحيح يدوي متزامن');
    expect(cache.get(legacyKey('Cotton shirt'))).toBe('تصحيح يدوي متزامن');
    expect(db.upsert.mock.calls[0][0].update).toEqual({});
    expect((await getCachedArabic(['Cotton shirt'])).get('Cotton shirt')).toBe('تصحيح يدوي متزامن');
  });
  it('does not claim a single or batch translation was saved when storage fails',async()=>{
    db.upsert.mockRejectedValue(new Error('private database failure'));
    expect(await translateToArabicCached('Cotton shirt')).toBeNull();
    expect(await translateManyCached(['Summer shirt'],1)).toEqual(new Map());
    expect(cache.size).toBe(0);expect(await getCachedArabic(['Cotton shirt','Summer shirt'])).toEqual(new Map());
  });
  it('does not claim success when the persisted translation cannot be read back',async()=>{
    db.upsert.mockImplementation(async(arg:CacheWrite)=>{
      const row=persist(arg);db.findMany.mockRejectedValue(new Error('private read failure'));return row;
    });
    expect(await translateToArabicCached('Cotton shirt')).toBeNull();
  });
  it('explicit learning never stores an English-only correction as Arabic',async()=>{
    await learnTranslation('Original product','Still English');expect(db.upsert).not.toHaveBeenCalled();
  });
  it('batch translation retains the entire source and does not treat mixed text as done',async()=>{
    const source='a long English description '.repeat(30)+'tail';const mixed='منتج English name';
    const result=await translateManyCached([source,mixed],2);
    expect(result.has(source)).toBe(true);expect(result.get(mixed)).toBe('ترجمة عربية مكتملة');
    expect(fetchMock.mock.calls.map(([url])=>new URL(url).searchParams.get('q')).join('')).toContain('tail');
  });
});
