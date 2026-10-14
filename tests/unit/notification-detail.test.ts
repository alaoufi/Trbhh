import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({view:vi.fn(),find:vi.fn(),count:vi.fn(),redirect:vi.fn((route:string)=>{throw new Error('redirect:'+route);})}));
vi.mock('next/navigation',()=>({redirect:mocks.redirect}));
vi.mock('@/lib/auth',()=>({getSession:async()=>({uid:7})}));
vi.mock('@/lib/chat-access',()=>({canUseMemberChat:mocks.view}));
vi.mock('@/lib/prisma',()=>({prisma:{chats:{findMany:mocks.find,count:mocks.count}}}));
vi.mock('@/app/notifications/actions',()=>({readMessageNotificationAction:vi.fn()}));
import Page from '@/app/notifications/messages/[senderId]/page';
beforeEach(()=>{vi.clearAllMocks();mocks.view.mockResolvedValue(true);mocks.find.mockResolvedValue([]);mocks.count.mockResolvedValue(80);});
describe('received message notification detail',()=>{
 it('blocks restricted organizational inbox before reading any messages',async()=>{mocks.view.mockResolvedValue(false);await expect(Page({params:Promise.resolve({senderId:'7'})})).rejects.toThrow('redirect:/notifications?tab=message');expect(mocks.find).not.toHaveBeenCalled();});
 it.each(['7','8'])('reads only messages received by owner for self or orphan sender %s',async sender=>{await Page({params:Promise.resolve({senderId:sender})});expect(mocks.find).toHaveBeenCalledWith({where:{reciver_id:7,sender_id:Number(sender)},orderBy:{id:'desc'},take:30,skip:0});});
 it('rejects malformed sender without database access',async()=>{await expect(Page({params:Promise.resolve({senderId:'broken'})})).rejects.toThrow('redirect:/notifications');expect(mocks.find).not.toHaveBeenCalled();});
});
