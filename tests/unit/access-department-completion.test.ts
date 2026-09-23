import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({guard:vi.fn(),actor:vi.fn(),complete:vi.fn(),revalidate:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/access-control/guards',()=>({requireAccess:m.guard,accessActor:m.actor}));
vi.mock('@/lib/access-control/store',()=>({completeStandardDepartments:m.complete,assignUserRoles:vi.fn(),saveDepartment:vi.fn(),saveRole:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:m.revalidate}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw Error('redirect:'+url);}}));
import {completeAccessDepartments} from '@/app/admin/access-control/actions';
beforeEach(()=>{vi.clearAllMocks();m.guard.mockResolvedValue({uid:9});m.actor.mockResolvedValue({userId:9,ip:'127.0.0.1',sessionFingerprint:'a'.repeat(64)});m.complete.mockResolvedValue(5);});
it('direct invocation requires independent access management before any mutation',async()=>{
 m.guard.mockRejectedValue(Error('access_forbidden'));
 await expect(completeAccessDepartments(new FormData())).rejects.toThrow('access_forbidden');
 expect(m.guard).toHaveBeenCalledWith('access_control','manage_settings');expect(m.complete).not.toHaveBeenCalled();
});
it('passes the authenticated actor and reason to the transactional audited repair',async()=>{
 const form=new FormData();form.set('reason','Complete approved departments');form.set('userId','999');
 await expect(completeAccessDepartments(form)).rejects.toThrow('section=departments&saved=1');
 expect(m.complete).toHaveBeenCalledWith({},expect.objectContaining({userId:9}), 'Complete approved departments');
 expect(m.revalidate).toHaveBeenCalledWith('/admin','layout');
});
it('does not expose private database errors or mark failure as saved',async()=>{
 m.complete.mockRejectedValue(Error('private database connection detail'));
 await expect(completeAccessDepartments(new FormData())).rejects.toThrow('section=departments&error=access_action_failed');
 expect(m.revalidate).not.toHaveBeenCalled();
});
