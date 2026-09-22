import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({create:vi.fn(),push:vi.fn(),access:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{chats:{findFirst:vi.fn().mockResolvedValue(null),create:m.create},users:{findUnique:vi.fn().mockResolvedValue({is_admin:0,name:'Fixture sender'})},chat_typing:{deleteMany:vi.fn().mockResolvedValue({count:0})},admin_message_threads:{upsert:vi.fn().mockResolvedValue({})}}}));
vi.mock('@/data/schema-sync',()=>({ensureSchema:vi.fn()}));
vi.mock('@/lib/admin-inbox',()=>({getPrimaryAdminId:vi.fn().mockResolvedValue(1)}));
vi.mock('@/lib/push',()=>({sendPushToUser:m.push}));
vi.mock('@/lib/chat-access',()=>({canUseMemberChat:m.access}));
import {sendChat} from '@/lib/chat';
beforeEach(()=>{vi.clearAllMocks();m.create.mockResolvedValue({id:88n});m.push.mockResolvedValue(undefined);m.access.mockResolvedValue(false);});
describe('organizational message notification authorization',()=>{
  it('stores a legitimate member support message but suppresses its snippet for a revoked primary recipient',async()=>{
    expect(await sendChat(7,1,'Private support request')).toBe(88);
    await vi.waitFor(()=>expect(m.access).toHaveBeenCalledWith(1,'view'));
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({sender_id:7,reciver_id:1,message:'Private support request'})}));
    expect(m.push).not.toHaveBeenCalled();
  });
  it('delivers to an authorized support recipient after checking its current view permission',async()=>{
    m.access.mockResolvedValue(true);await sendChat(7,1,'Support request');
    await vi.waitFor(()=>expect(m.push).toHaveBeenCalledWith(1,expect.objectContaining({body:'Support request'})));
    expect(m.access).toHaveBeenCalledWith(1,'view');
  });
  it('preserves system replies to ordinary recipients by checking recipient rather than system sender',async()=>{
    m.access.mockImplementation(async uid=>uid!==1);await sendChat(1,7,'System acknowledgment');
    await vi.waitFor(()=>expect(m.push).toHaveBeenCalledWith(7,expect.objectContaining({body:'System acknowledgment'})));
    expect(m.access).toHaveBeenCalledWith(7,'view');
  });
});
