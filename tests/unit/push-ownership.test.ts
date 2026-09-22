import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rows:vi.fn(),sql:vi.fn(),create:vi.fn(),transaction:vi.fn(),uid:7}));
vi.mock('@/data/schema-sync',()=>({ensureSchema:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{$transaction:m.transaction,$executeRaw:m.sql}}));
vi.mock('@/lib/settings',()=>({getSetting:vi.fn(),getSettingBool:vi.fn().mockResolvedValue(true),setSetting:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:vi.fn(()=>Promise.resolve({uid:m.uid}))}));
import {deletePushSub,savePushSub} from '@/lib/push';
import {DELETE,POST} from '@/app/api/push/route';
import {NextRequest} from 'next/server';
const endpoint='https://push.example.test/device-7',subscription={endpoint,keys:{p256dh:'fixture-key',auth:'fixture-auth'}};
beforeEach(()=>{vi.clearAllMocks();m.uid=7;m.rows.mockResolvedValue([]);m.create.mockResolvedValue({});m.sql.mockResolvedValue(1);m.transaction.mockImplementation(async cb=>cb({$queryRaw:m.rows,$executeRaw:m.sql,push_subs:{create:m.create}}));});
describe('push subscription ownership',()=>{
  it('never replaces another member endpoint',async()=>{
    m.rows.mockResolvedValue([{id:9n,user_id:8n}]);expect(await savePushSub(7,subscription)).toBe(false);
    expect(m.sql).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();
  });
  it('first registration is serialized and locks the exact endpoint',async()=>{
    expect(await savePushSub(7,subscription)).toBe(true);
    expect(m.transaction).toHaveBeenCalledWith(expect.any(Function),expect.objectContaining({isolationLevel:'Serializable'}));
    expect(m.rows.mock.calls[0][0].join('?')).toContain('BINARY endpoint=? FOR UPDATE');
    expect(m.create).toHaveBeenCalledWith({data:{user_id:7n,endpoint,p256dh:'fixture-key',auth:'fixture-auth'}});
  });
  it('same owner refresh updates only its existing endpoint without delete/recreate',async()=>{
    m.rows.mockResolvedValue([{id:9n,user_id:7n}]);expect(await savePushSub(7,subscription)).toBe(true);
    const call=m.sql.mock.calls[0];expect(call[0].join('?')).toContain('WHERE user_id=? AND BINARY endpoint=?');expect(call.slice(1)).toEqual(['fixture-key','fixture-auth',7,endpoint]);expect(m.create).not.toHaveBeenCalled();
  });
  it('deletion always binds the authenticated owner as well as the endpoint',async()=>{
    await deletePushSub(7,endpoint);const call=m.sql.mock.calls[0];expect(call[0].join('?')).toContain('DELETE FROM push_subs WHERE user_id=? AND BINARY endpoint=?');expect(call.slice(1)).toEqual([7,endpoint]);
  });
  it('API DELETE takes owner identity from its session rather than request data',async()=>{
    await DELETE(new NextRequest('https://example.test/api/push',{method:'DELETE',body:JSON.stringify({endpoint,userId:8})}));
    expect(m.sql.mock.calls[0].slice(1)).toEqual([7,endpoint]);
  });
  it('API refuses endpoint takeover rather than reporting success',async()=>{
    m.rows.mockResolvedValue([{id:9n,user_id:8n}]);
    const r=await POST(new NextRequest('https://example.test/api/push',{method:'POST',body:JSON.stringify(subscription)}));expect(r.status).toBe(409);expect(m.create).not.toHaveBeenCalled();
  });
  it('does not truncate attacker input into an existing endpoint',async()=>{
    expect(await savePushSub(7,{...subscription,endpoint:'x'.repeat(501)})).toBe(false);await deletePushSub(7,'x'.repeat(501));expect(m.transaction).not.toHaveBeenCalled();expect(m.sql).not.toHaveBeenCalled();
  });
});
