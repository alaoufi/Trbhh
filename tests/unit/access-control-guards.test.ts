import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn(),session:vi.fn(),schema:vi.fn(),cookie:vi.fn(),header:vi.fn()}));
vi.mock('react',()=>({cache:(fn:unknown)=>fn}));
vi.mock('@/lib/access-control/store',()=>({readAccess:m.read}));
vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/auth',()=>({getSession:m.session}));
vi.mock('@/data/schema-sync',()=>({ensureSchema:m.schema}));
vi.mock('next/navigation',()=>({redirect:(path:string)=>{throw new Error('redirect:'+path);}}));
vi.mock('next/headers',()=>({headers:async()=>({get:m.header}),cookies:async()=>({get:m.cookie})}));
import {hasAccess,requireAccess,requireAdminPage,accessActor} from '@/lib/access-control/guards';
beforeEach(()=>{vi.clearAllMocks();m.schema.mockResolvedValue(undefined);m.session.mockResolvedValue({uid:7,authVersion:'0'});m.read.mockResolvedValue({ready:true,keys:new Set(['users:view']),roles:[]});m.header.mockReturnValue(null);m.cookie.mockReturnValue(undefined);});
describe('server RBAC guard',()=>{
  it('denies unknown keys even if a malformed source returned them',async()=>{
    m.read.mockResolvedValue({ready:true,keys:new Set(['unknown:view','__proto__:view']),roles:[]});
    expect(await hasAccess(7,'unknown')).toBe(false);expect(await hasAccess(7,'__proto__')).toBe(false);expect(m.read).not.toHaveBeenCalled();
  });
  it('fails closed for missing initialization and either database failure',async()=>{
    m.read.mockResolvedValue({ready:false,keys:new Set(['users:view']),roles:[]});expect(await hasAccess(7,'users')).toBe(false);
    m.read.mockRejectedValue(new Error('offline'));expect(await hasAccess(7,'users')).toBe(false);
    m.schema.mockRejectedValue(new Error('ddl offline'));expect(await hasAccess(7,'users')).toBe(false);
  });
  it('does not use role names, is_admin or another module as an override',async()=>{
    m.read.mockResolvedValue({ready:true,keys:new Set(['users:view']),roles:[{id:'manager'}],is_admin:1});
    await expect(requireAccess('finance')).rejects.toThrow('access=denied');
    expect(await requireAccess('users')).toHaveProperty('uid',7);
  });
  it('distinguishes tax from ordinary finance and refuses unregistered pages',async()=>{
    m.read.mockResolvedValue({ready:true,keys:new Set(['finance:view']),roles:[]});
    await expect(requireAdminPage('/admin/finance',{section:'tax'})).rejects.toThrow('access=denied');
    await expect(requireAdminPage('/admin/not-registered')).rejects.toThrow('access=denied');
  });
  it('requires authentication before protected queries',async()=>{
    m.session.mockResolvedValue(null);await expect(requireAccess('users')).rejects.toThrow('/login');expect(m.read).not.toHaveBeenCalled();
  });
  it('records only a one-way session fingerprint and a validated reported IP',async()=>{
    m.cookie.mockReturnValue({value:'private-session-token'});m.header.mockImplementation((name:string)=>name==='x-forwarded-for'?'203.0.113.7, 127.0.0.1':null);
    const actor=await accessActor({uid:7,name:'staff',type:'user',authVersion:'0'});
    expect(actor.ip).toBe('203.0.113.7');expect(actor.sessionFingerprint).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(actor)).not.toContain('private-session-token');
    m.header.mockReturnValue('not-an-ip');expect((await accessActor({uid:7,name:'staff',type:'user',authVersion:'0'})).ip).toBeNull();
  });
});
