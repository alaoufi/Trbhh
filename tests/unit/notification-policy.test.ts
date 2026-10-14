import {describe,it,expect} from 'vitest';
import {notificationId,safeNotificationRoute,messageNotificationDestination} from '@/lib/notification-policy';
describe('notification opening policy',()=>{
 it('rejects malformed IDs without throwing',()=>{for(const id of ['x','-1','0','1.5',''])expect(notificationId(id)).toBeNull();expect(notificationId('12')).toBe(12n);});
 it('keeps redirects internal',()=>{for(const route of ['https://evil.test','//evil.test','/\\evil.test','/x\n','javascript:alert(1)'])expect(safeNotificationRoute(route)).toBe('/notifications');expect(safeNotificationRoute('/account?tab=subscription')).toBe('/account?tab=subscription');});
 it('opens received notification detail for self and deleted senders',()=>{expect(messageNotificationDestination(7,7,false,true)).toBe('/notifications/messages/7');expect(messageNotificationDestination(7,8,false,true)).toBe('/notifications/messages/8');expect(messageNotificationDestination(7,8,true,false)).toBeNull();});
});
