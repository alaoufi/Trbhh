import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({find:vi.fn(),update:vi.fn(),chats:vi.fn(),view:vi.fn(),redirect:vi.fn((route:string)=>{throw new Error('redirect:'+route);})}));
vi.mock('next/navigation',()=>({redirect:mocks.redirect}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireUser:async()=>({uid:7})}));
vi.mock('@/lib/chat-access',()=>({canUseMemberChat:mocks.view}));
vi.mock('@/lib/prisma',()=>({prisma:{notfications:{findFirst:mocks.find,updateMany:mocks.update},chats:{updateMany:mocks.chats}}}));
import {openNotifAction,readMessageNotificationAction} from '@/app/notifications/actions';
beforeEach(()=>{vi.clearAllMocks();mocks.view.mockResolvedValue(true);mocks.update.mockResolvedValue({count:1});mocks.chats.mockResolvedValue({count:1});});
describe('notification ownership and access',()=>{
 it('rejects invalid notification without querying',async()=>{const form=new FormData();form.set('id','broken');await expect(openNotifAction(form)).rejects.toThrow('redirect:/notifications');expect(mocks.find).not.toHaveBeenCalled();});
 it('scopes both read and update to authenticated owner',async()=>{mocks.find.mockResolvedValue({route:'//external.test',read_at:null});const form=new FormData();form.set('id','9');await expect(openNotifAction(form)).rejects.toThrow('redirect:/notifications');expect(mocks.find).toHaveBeenCalledWith({where:{id:9n,user_id:'7'}});expect(mocks.update.mock.calls[0][0].where).toEqual({id:9n,user_id:'7',read_at:null});});
 it.each([null,'','1.5','-1'])('rejects missing or malformed sender %s before writes',async raw=>{const form=new FormData();if(raw!==null)form.set('sender',raw);await expect(readMessageNotificationAction(form)).rejects.toThrow('redirect:/notifications');expect(mocks.chats).not.toHaveBeenCalled();});
 it('denied inbox never changes message state',async()=>{mocks.view.mockResolvedValue(false);const form=new FormData();form.set('sender','8');await expect(readMessageNotificationAction(form)).rejects.toThrow('redirect:/notifications');expect(mocks.chats).not.toHaveBeenCalled();});
 it('acknowledges only this received sender and preserves message history',async()=>{const form=new FormData();form.set('sender','7');await expect(readMessageNotificationAction(form)).rejects.toThrow('redirect:/notifications');expect(mocks.chats).toHaveBeenCalledWith({where:{reciver_id:7,sender_id:7,is_read:0},data:{is_read:1}});});
});
