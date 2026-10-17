import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({get:vi.fn(),config:vi.fn()}));
vi.mock('@/lib/cj/client',()=>({getCjSizeChart:mocks.get}));
vi.mock('@/lib/cj/config',()=>({cjConfig:mocks.config}));
beforeEach(()=>{vi.resetModules();mocks.get.mockReset();mocks.config.mockReturnValue({base:'base',email:'a',apiKey:'key',encryptionKey:'enc'});});
describe('size chart server read cache',()=>{
 it('coalesces reads and keeps account/product identities separate',async()=>{
 mocks.get.mockImplementation(async(pid:string)=>({ok:true,data:{pid,configured:false,baseVariantKey:null,rows:[]}}));
 const {readCjSizeChart}=await import('@/lib/cj/size-chart-server');
 const [a,b]=await Promise.all([readCjSizeChart('a'),readCjSizeChart('a')]);expect(a).toEqual(b);expect(mocks.get).toHaveBeenCalledTimes(1);
 await readCjSizeChart('b');expect(mocks.get).toHaveBeenCalledTimes(2);
 mocks.config.mockReturnValue({base:'base',email:'other',apiKey:'key2'});await readCjSizeChart('a');expect(mocks.get).toHaveBeenCalledTimes(3);
 });
 it('fails closed without synthesizing equivalents',async()=>{mocks.get.mockRejectedValue(new Error('offline'));const {readCjSizeChart}=await import('@/lib/cj/size-chart-server');expect(await readCjSizeChart('p')).toBeNull();});
});
