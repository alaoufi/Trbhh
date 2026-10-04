import {it,expect,vi} from 'vitest';
const findMany=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/prisma',()=>({prisma:{profiles:{findMany}}}));
import {getAdPersonalNames} from '@/lib/ad-personal-names';
it('uses only the owned additional personal identity, in one batch',async()=>{
 findMany.mockResolvedValue([{id:5n,user_id:2n,name:'هوية النشر'},{id:6n,user_id:9n,name:'حساب آخر'},{id:7n,user_id:2n,name:'  '}]);
 const names=await getAdPersonalNames([{id:1n,user_id:2n,profile_id:5n},{id:2n,user_id:2n,profile_id:6n},{id:3n,user_id:2n,profile_id:7n}]);
 expect([...names]).toEqual([[1,'هوية النشر']]);
 expect(findMany).toHaveBeenCalledTimes(1);
 expect(findMany).toHaveBeenCalledWith({where:{id:{in:[5n,6n,7n]},type:'personal',is_default:0},select:{id:true,user_id:true,name:true}});
});
it('does not query profiles for legacy ads without a publishing identity',async()=>{
 findMany.mockClear();expect((await getAdPersonalNames([{id:1n,user_id:2n}])).size).toBe(0);expect(findMany).not.toHaveBeenCalled();
});
