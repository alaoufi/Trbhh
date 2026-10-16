import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const settings=vi.hoisted(()=>({enabled:'1'}));
vi.mock('@/lib/settings',()=>({getSetting:async()=>settings.enabled}));
import {clearLocalInferenceCache,localGenerate,localSearchQueries,localPublicSearchQueries,localTranslation,localServiceUrl,localSearchActive} from '@/lib/ai/local';
const fetcher=vi.fn();
beforeEach(()=>{settings.enabled='1';clearLocalInferenceCache();fetcher.mockReset();vi.stubGlobal('fetch',fetcher);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
const answer=(value:unknown)=>new Response(JSON.stringify({done:true,message:{content:JSON.stringify(value)}}));
describe('local intelligence boundary',()=>{
 it('retains explicit attributes after incomplete model output with just one inference',async()=>{
  fetcher.mockResolvedValue(answer({queries:['walking shoe']}));
  expect(await localSearchQueries('جزمة للمشي ضد الموية مقاس 42')).toEqual(['walking shoe water-resistant size 42']);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(JSON.parse(fetcher.mock.calls[0][1].body).options).toMatchObject({num_thread:4,num_ctx:2048,num_predict:64});
 });
 it('gives simultaneous search priority over a background reservation before fetch starts',async()=>{
  fetcher.mockResolvedValue(answer({queries:['kitchen organizer']}));
  const jobs=await Promise.all([localTranslation('pending background','ar',45000,{priority:'background'}),localSearchQueries('منظم المطبخ')]);
  expect(jobs).toEqual([null,['kitchen organizer']]);expect(fetcher).toHaveBeenCalledOnce();
  expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe('trbhh-local:search');
 });
 it('activates supplier search independently from the translation model',async()=>{
  fetcher.mockResolvedValue(answer({queries:['kitchen organizer']}));
  await localSearchQueries('منظم المطبخ');
  expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe('trbhh-local:search');
 });
 it('search cancels background work and takes priority without parallel model requests',async()=>{
  fetcher.mockImplementationOnce((_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('cancelled')))));
  const background=localTranslation('background','ar',45000,{priority:'background'});
  await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());
  fetcher.mockImplementationOnce(async()=>{expect(localSearchActive()).toBe(true);return answer({queries:['kitchen organizer']});});
  const search=localSearchQueries('منظم المطبخ');
  expect(await background).toBeNull();expect(await search).toEqual(['kitchen organizer']);expect(fetcher).toHaveBeenCalledTimes(2);
  expect(localSearchActive()).toBe(false);
 });
 it('shares one intelligent answer across forty simultaneous visitors',async()=>{
  let release!:(response:Response)=>void;fetcher.mockImplementation(()=>new Promise<Response>(resolve=>{release=resolve;}));
  const jobs=Array.from({length:40},()=>localSearchQueries('شي يرتب لي أدوات المطبخ'));
  await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());release(answer({queries:['kitchen organizer']}));
  expect((await Promise.all(jobs)).every(result=>result[0]==='kitchen organizer')).toBe(true);
 });
 it('uses a local Arabic catalog interpretation for public search, retaining brand and model',async()=>{
  fetcher.mockResolvedValue(answer({queries:['غطاء Samsung S24']}));
  expect(await localPublicSearchQueries('أبغى كفر Samsung S24')).toEqual(['غطاء Samsung S24']);
  expect(JSON.parse(fetcher.mock.calls[0][1].body).messages[1].content).toContain('Arabic catalog noun phrase');
 });
 it('rejects a public interpretation losing a model, returning no expansion',async()=>{
  fetcher.mockResolvedValue(answer({queries:['غطاء Samsung']}));
  expect(await localPublicSearchQueries('أبغى كفر Samsung S24')).toEqual([]);
 });
 it.each(['https://cloud.example','http://user:pass@ollama:11434','http://169.254.169.254','http://ollama.evil:11434','http://ollama:11434/remote'])('rejects non-local endpoint %s',url=>{expect(localServiceUrl(url,'ollama')).toBeNull();});
 it('accepts only named local service or loopback',()=>{expect(localServiceUrl('http://ollama:11434','ollama')).toBe('http://ollama:11434');expect(localServiceUrl('http://localhost:11434','ollama')).toBe('http://localhost:11434');});
 it('requests structured local inference without tools, redirects or cloud models',async()=>{
  fetcher.mockResolvedValue(answer({translation:'قميص قطني'}));
  expect(await localTranslation('Cotton shirt','ar')).toBe('قميص قطني');
  const [url,init]=fetcher.mock.calls[0];expect(url).toBe('http://ollama:11434/api/chat');expect(init.redirect).toBe('error');
  expect(JSON.parse(init.body)).toMatchObject({model:'trbhh-local:translation',stream:false,think:false});
  const body=JSON.parse(init.body);expect(body.messages.map((m:{role:string})=>m.role)).toEqual(['system','user']);
  expect(body.messages[0].content).toContain('untrusted');expect(body.messages[1].content).toContain('Cotton shirt');
 });
 it('returns one complete intent phrase without a phone vocabulary table',async()=>{
  fetcher.mockResolvedValue(answer({queries:['cordless drill 18V']}));
  expect(await localSearchQueries('ابغى دريل بدون سلك 18V')).toEqual(['cordless drill 18V']);
 });
 it.each(['phone case','S24 phone case','Samsung phone case'])('rejects a phrase losing a brand or model: %s',async phrase=>{
  fetcher.mockResolvedValue(answer({queries:[phrase]}));
  expect(await localSearchQueries('غطاء Samsung S24')).toEqual([]);
 });
 it('rejects an overlong alternatives list instead of accepting an inconsistent contract',async()=>{
  fetcher.mockResolvedValue(answer({queries:['Samsung S24 cover','S24 phone case','Samsung Galaxy S24 case']}));
  expect(await localSearchQueries('غطاء Samsung S24')).toEqual([]);
 });
 it('preserves quantities when catalog units use a different space convention',async()=>{
  fetcher.mockResolvedValueOnce(answer({queries:['18 V cordless drill']}));
  expect(await localSearchQueries('دريل بدون سلك 18V')).toEqual(['18 V cordless drill']);
  fetcher.mockResolvedValueOnce(answer({queries:['750ml steel bottle']}));
  expect(await localSearchQueries('قارورة فولاذ 750 ml')).toEqual(['750ml steel bottle']);
 });
 it('does not expose invalid or interrupted model output',async()=>{
  fetcher.mockResolvedValue(new Response(JSON.stringify({done:false,response:'{}'})));
  expect(await localGenerate('data','task',{type:'object'})).toBeNull();
  fetcher.mockResolvedValue(new Response('not-json'));expect(await localSearchQueries('منتج')).toEqual([]);
 });
 it('outage does not trigger requests to any other host',async()=>{
  fetcher.mockRejectedValue(Error('offline'));expect(await localTranslation('shirt','ar')).toBeNull();expect(fetcher).toHaveBeenCalledOnce();
 });
 it('rejects an external configured endpoint before fetch',async()=>{
  vi.stubEnv('LOCAL_AI_URL','https://example.com');expect(await localSearchQueries('منتج')).toEqual([]);expect(fetcher).not.toHaveBeenCalled();
 });
 it('rejects input exceeding the inference context rather than silently truncating it',async()=>{
  expect(await localTranslation('x'.repeat(2049),'ar')).toBeNull();expect(fetcher).not.toHaveBeenCalled();
 });
 it('bounds concurrent model requests',async()=>{
  const resolvers:((response:Response)=>void)[]=[];
  fetcher.mockImplementation(()=>new Promise<Response>(resolve=>resolvers.push(resolve)));
  const first=localTranslation('first','ar');
  await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());
  const second=localTranslation('second','ar');
  expect(await second).toBeNull();
  expect(await localTranslation('third','ar')).toBeNull();
  expect(fetcher).toHaveBeenCalledOnce();
  for(const resolve of resolvers)resolve(answer({translation:'ترجمة عربية'}));
  expect(await first).toBe('ترجمة عربية');
 });
 it('reuses successful output within the bounded cache',async()=>{
  fetcher.mockResolvedValue(answer({translation:'مطرقة اختبار'}));
  expect(await localTranslation('cache-test hammer','ar')).toBe('مطرقة اختبار');
  expect(await localTranslation('cache-test hammer','ar')).toBe('مطرقة اختبار');
  expect(fetcher).toHaveBeenCalledOnce();
 });
 it('expires cached inference after one hour',async()=>{
  const clock=vi.spyOn(Date,'now').mockReturnValue(1000);
  fetcher.mockImplementation(async()=>answer({translation:'قميص قطني'}));
  await localTranslation('expiry shirt','ar');clock.mockReturnValue(3_601_001);
  await localTranslation('expiry shirt','ar');expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('evicts the oldest output after 128 entries instead of growing without bound',async()=>{
  fetcher.mockImplementation(async()=>answer({translation:'قميص قطني'}));
  for(let i=0;i<129;i++)await localTranslation(`bounded shirt ${i}`,'ar');
  await localTranslation('bounded shirt 0','ar');expect(fetcher).toHaveBeenCalledTimes(130);
 });
 it('honors disabling even for a cached result and clears it before re-enabling',async()=>{
  fetcher.mockImplementation(async()=>answer({translation:'قميص قطني'}));
  await localTranslation('disable shirt','ar');settings.enabled='0';
  expect(await localTranslation('disable shirt','ar')).toBeNull();expect(fetcher).toHaveBeenCalledOnce();
  settings.enabled='1';await localTranslation('disable shirt','ar');expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('does not cache a failed request',async()=>{
  fetcher.mockResolvedValueOnce(new Response('offline',{status:503})).mockResolvedValueOnce(answer({translation:'قميص قطني'}));
  expect(await localTranslation('retry shirt','ar')).toBeNull();
  expect(await localTranslation('retry shirt','ar')).toBe('قميص قطني');expect(fetcher).toHaveBeenCalledTimes(2);
 });
});
