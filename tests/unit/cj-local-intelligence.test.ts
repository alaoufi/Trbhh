import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/settings',()=>({getSetting:async(_key:string,fallback:string)=>fallback}));
import {localGenerate,localSearchQueries,localTranslation,localServiceUrl} from '@/lib/ai/local';
const fetcher=vi.fn();
beforeEach(()=>{fetcher.mockReset();vi.stubGlobal('fetch',fetcher);});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const answer=(value:unknown)=>new Response(JSON.stringify({done:true,response:JSON.stringify(value)}));
describe('local intelligence boundary',()=>{
 it.each(['https://cloud.example','http://user:pass@ollama:11434','http://169.254.169.254','http://ollama.evil:11434','http://ollama:11434/remote'])('rejects non-local endpoint %s',url=>{expect(localServiceUrl(url,'ollama')).toBeNull();});
 it('accepts only named local service or loopback',()=>{expect(localServiceUrl('http://ollama:11434','ollama')).toBe('http://ollama:11434');expect(localServiceUrl('http://localhost:11434','ollama')).toBe('http://localhost:11434');});
 it('requests structured local inference without tools, redirects or cloud models',async()=>{
  fetcher.mockResolvedValue(answer({translation:'قميص قطني'}));
  expect(await localTranslation('Cotton shirt','ar')).toBe('قميص قطني');
  const [url,init]=fetcher.mock.calls[0];expect(url).toBe('http://ollama:11434/api/generate');expect(init.redirect).toBe('error');
  expect(JSON.parse(init.body)).toMatchObject({model:'trbhh-local:active',stream:false,think:false});
 });
 it('returns intent alternatives without a phone vocabulary table',async()=>{
  fetcher.mockResolvedValue(answer({queries:['cordless drill 18V','18V cordless drill','cordless drill 18V']}));
  expect(await localSearchQueries('ابغى دريل بدون سلك 18V')).toEqual(['cordless drill 18V','18V cordless drill']);
 });
 it('rejects alternatives that lose model numbers',async()=>{
  fetcher.mockResolvedValue(answer({queries:['phone case','Samsung S24 case']}));
  expect(await localSearchQueries('غطاء Samsung S24')).toEqual(['Samsung S24 case']);
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
  const first=localTranslation('first','ar'),second=localTranslation('second','ar');
  expect(await localTranslation('third','ar')).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
  for(const resolve of resolvers)resolve(answer({translation:'ترجمة عربية'}));
  expect(await Promise.all([first,second])).toEqual(['ترجمة عربية','ترجمة عربية']);
 });
});
