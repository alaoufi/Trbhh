import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({find:vi.fn(),create:vi.fn(),user:vi.fn(),lock:vi.fn()}));
vi.mock('@/data/schema-sync',()=>({ensureSchema:async()=>{}}));
vi.mock('@/lib/prisma',()=>{const db={profiles:{findFirst:m.find,create:m.create},users:{findUnique:m.user},$queryRaw:m.lock};return {prisma:{...db,$transaction:async(fn:(tx:unknown)=>unknown)=>fn(db)}};});
import {ensureDefaultProfile} from '@/lib/profiles';
const row={id:16n,user_id:7n,type:'personal',is_default:1,name:'عضو',avatar:0};
beforeEach(()=>{vi.clearAllMocks();m.find.mockResolvedValue(row);m.user.mockResolvedValue({name:'عضو'});m.create.mockResolvedValue({...row,id:17n});});
it('does not interpret a failed read as a missing identity',async()=>{m.find.mockRejectedValue(new Error('read failed'));await expect(ensureDefaultProfile(7)).rejects.toThrow('read failed');expect(m.create).not.toHaveBeenCalled();});
it('rechecks under the account row lock before inserting a default',async()=>{m.find.mockResolvedValueOnce(null).mockResolvedValue(row);expect((await ensureDefaultProfile(7)).id).toBe(16);expect(m.lock).toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();});
