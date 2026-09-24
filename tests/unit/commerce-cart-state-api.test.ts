import {beforeEach,describe,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({session:vi.fn(),ready:vi.fn(),query:vi.fn(),execute:vi.fn(),transaction:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:mocks.session}));
vi.mock('@/lib/commerce/schema',()=>({assertCommerceSchemaReady:mocks.ready}));
vi.mock('@/lib/public-origin',()=>({primaryOrigin:'https://trbhh.sa'}));
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:mocks.query,$executeRaw:mocks.execute,$transaction:mocks.transaction}}));
import {GET,POST,PUT} from '@/app/api/shop/cart/state/route';

function request(method:'POST'|'PUT',items:unknown,origin='https://trbhh.sa'){
 return new Request('https://trbhh.sa/api/shop/cart/state',{method,headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify({items})});
}
describe('account-persisted commerce cart boundary',()=>{
 beforeEach(()=>{
  vi.resetAllMocks();mocks.session.mockResolvedValue({uid:7});mocks.ready.mockResolvedValue(undefined);mocks.execute.mockResolvedValue(1);
  const tx={$queryRaw:mocks.query,$executeRaw:mocks.execute};mocks.transaction.mockImplementation(async(work:(value:typeof tx)=>Promise<unknown>)=>work(tx));
 });
 it('merges a guest basket into the owned account basket and persists it idempotently',async()=>{
  mocks.query.mockResolvedValueOnce([{id:7n}]).mockResolvedValueOnce([{items:[{productId:'12',quantity:1}]}]);
  const response=await POST(request('POST',[{productId:'12',quantity:1},{productId:'14',quantity:2}]));
  expect(response.status).toBe(200);expect(await response.json()).toEqual({items:[{productId:'12',quantity:1},{productId:'14',quantity:2}]});expect(mocks.execute).toHaveBeenCalledTimes(1);
 });
 it('replaces only the signed-in member basket and rejects cross-site writes',async()=>{
  mocks.query.mockResolvedValueOnce([{id:7n}]).mockResolvedValueOnce([]);
  expect((await PUT(request('PUT',[{productId:'14',quantity:1}],'https://attacker.example'))).status).toBe(403);
  const response=await PUT(request('PUT',[{productId:'14',quantity:1}]));expect(response.status).toBe(200);expect(await response.json()).toEqual({items:[{productId:'14',quantity:1}]});
 });
 it('does not read or write a cart without a valid session',async()=>{
  mocks.session.mockResolvedValue(null);expect((await GET()).status).toBe(401);expect(mocks.query).not.toHaveBeenCalled();
 });
});
