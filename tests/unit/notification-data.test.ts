import {describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({chats:vi.fn(),stored:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{chats:{count:mocks.chats},notfications:{count:mocks.stored}}}));
import {notificationCounts,storedNotificationFilter} from '@/lib/notification-data';
describe('shared header and notification count',()=>{
 it('counts beyond former truncation and includes null notification kinds',async()=>{mocks.chats.mockResolvedValue(205);mocks.stored.mockResolvedValue(510);expect(await notificationCounts(7)).toEqual({messages:205,stored:510,total:715});expect(mocks.chats).toHaveBeenCalledWith({where:{reciver_id:7,is_read:0}});expect(mocks.stored).toHaveBeenCalledWith({where:{...storedNotificationFilter(7),read_at:null}});expect(storedNotificationFilter(7)).toEqual({user_id:'7',OR:[{type:null},{type:{not:'message'}}]});});
});
