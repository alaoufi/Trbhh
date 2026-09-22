import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>({uid:1,primary:vi.fn(),access:vi.fn(),poll:vi.fn(),send:vi.fn(),typing:vi.fn(),remove:vi.fn()}));
vi.mock('@/lib/admin-inbox',()=>({getPrimaryAdminIdStrict:m.primary,getPrimaryAdminId:vi.fn().mockResolvedValue(1),smartAdminReply:vi.fn(),shouldAutoReply:vi.fn().mockResolvedValue(false)}));
vi.mock('@/lib/access-control/guards',()=>({hasAccess:m.access}));
vi.mock('@/lib/auth',()=>({getSession:vi.fn(()=>Promise.resolve({uid:m.uid})),requireUser:vi.fn(()=>Promise.resolve({uid:m.uid}))}));
vi.mock('@/lib/chat',()=>({pollThread:m.poll,sendChat:m.send,setTyping:m.typing,deleteChatMessage:m.remove,screenChatMessage:vi.fn(async(_uid,text)=>({ok:true,text}))}));
vi.mock('@/lib/settings',()=>({getMsgDeleteMinutes:vi.fn().mockResolvedValue(5)}));
import {canUseMemberChat} from '@/lib/chat-access';
import {GET,POST,DELETE} from '@/app/api/chat/[peerId]/route';
beforeEach(()=>{vi.clearAllMocks();m.uid=1;m.primary.mockResolvedValue(1);m.access.mockResolvedValue(false);m.poll.mockResolvedValue({messages:[]});m.send.mockResolvedValue(1);m.remove.mockResolvedValue(true);});
const ctx=()=>({params:Promise.resolve({peerId:'12'})});
describe('organizational inbox access on member chat routes',()=>{
  it('revoked legacy primary admin cannot read, send, type or delete through generic endpoints',async()=>{
    const base='https://example.test/api/chat/12';
    expect((await GET(new NextRequest(base),ctx())).status).toBe(403);
    expect((await POST(new NextRequest(base,{method:'POST',body:JSON.stringify({message:'test'})}),ctx())).status).toBe(403);
    expect((await POST(new NextRequest(base,{method:'POST',body:JSON.stringify({kind:'typing'})}),ctx())).status).toBe(403);
    expect((await DELETE(new NextRequest(base,{method:'DELETE',body:JSON.stringify({messageId:9})}),ctx())).status).toBe(403);
    for(const fn of [m.poll,m.send,m.typing,m.remove])expect(fn).not.toHaveBeenCalled();
  });
  it('inbox view does not grant create/delete; exact capabilities allow their operation',async()=>{
    m.access.mockImplementation(async(_uid,_module,action)=>action==='view');
    expect(await canUseMemberChat(1,'view')).toBe(true);expect(await canUseMemberChat(1,'create')).toBe(false);expect(await canUseMemberChat(1,'delete')).toBe(false);
    m.access.mockImplementation(async(_uid,_module,action)=>['view','delete'].includes(action));
    expect((await DELETE(new NextRequest('https://example.test/api/chat/12',{method:'DELETE',body:JSON.stringify({messageId:9})}),ctx())).status).toBe(200);
    expect(m.remove).toHaveBeenCalledWith(1,9,5);expect(await canUseMemberChat(1,'create')).toBe(false);
  });
  it('ordinary member conversations and contact with support do not require staff grants',async()=>{
    m.uid=7;expect(await canUseMemberChat(7,'create')).toBe(true);
    const r=await GET(new NextRequest('https://example.test/api/chat/1'),{params:Promise.resolve({peerId:'1'})});expect(r.status).toBe(200);expect(m.poll).toHaveBeenCalledWith(7,1,0);expect(m.access).not.toHaveBeenCalled();
  });
  it('an explicitly authorized primary inbox author can send a reply',async()=>{
    m.access.mockImplementation(async(_uid,_module,action)=>['view','create'].includes(action));
    const response=await POST(new NextRequest('https://example.test/api/chat/12',{method:'POST',body:JSON.stringify({message:'Authorized reply'})}),ctx());
    expect(response.status).toBe(200);expect(m.send).toHaveBeenCalledWith(1,12,'Authorized reply');
  });
  it('identity or permissions storage errors deny rather than fall back to ordinary ownership',async()=>{
    m.primary.mockRejectedValue(new Error('database unavailable'));expect(await canUseMemberChat(1,'view')).toBe(false);expect(await canUseMemberChat(7,'view')).toBe(false);
    m.primary.mockResolvedValue(1);m.access.mockRejectedValue(new Error('schema missing'));expect(await canUseMemberChat(1,'view')).toBe(false);
  });
});
