import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({find:vi.fn(),remove:vi.fn(),cookie:vi.fn()}));
vi.mock('@/data/schema-sync',()=>({ensureSchema:async()=>{}}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>undefined,set:m.cookie})}));
vi.mock('@/lib/prisma',()=>({prisma:{profiles:{findFirst:m.find,delete:m.remove,deleteMany:m.remove}}}));
import {deletePersonalProfile} from '@/lib/profiles';
describe('profile deletion truthfulness',()=>{
 beforeEach(()=>{vi.clearAllMocks();m.find.mockResolvedValue({id:2n,is_default:0});m.remove.mockResolvedValue({count:1});});
 it('never reports successful deletion when persistence fails',async()=>{m.remove.mockRejectedValue(new Error('database unavailable'));await expect(deletePersonalProfile(7,2)).rejects.toThrow();});
 it('returns false if another request already removed the profile',async()=>{m.remove.mockResolvedValue({count:0});expect(await deletePersonalProfile(7,2)).toBe(false);});
 it('protects the default profile',async()=>{m.find.mockResolvedValue({id:2n,is_default:1});expect(await deletePersonalProfile(7,2)).toBe(false);expect(m.remove).not.toHaveBeenCalled();});
 it('deletes only the owned non-default personal identity',async()=>{expect(await deletePersonalProfile(7,2)).toBe(true);expect(m.remove).toHaveBeenCalledWith({where:{id:2n,user_id:7n,type:'personal',is_default:0}});});
});
