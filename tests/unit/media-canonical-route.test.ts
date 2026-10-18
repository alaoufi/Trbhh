import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({statLocal:vi.fn(),statInDir:vi.fn(),upload:vi.fn(),topup:vi.fn(),session:vi.fn(),access:vi.fn()}));
vi.mock('@/lib/storage',()=>({statLocal:mocks.statLocal,statInDir:mocks.statInDir}));
vi.mock('@/lib/upload-normalize',()=>({isHeicBytes:()=>false,heicBytesToJpeg:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{uploads:{findFirst:mocks.upload},wallet_topups:{findFirst:mocks.topup}}}));
vi.mock('@/lib/auth',()=>({getSession:mocks.session}));
vi.mock('@/lib/access-control/guards',()=>({hasAccess:mocks.access}));
import {GET} from '@/app/media/[...path]/route';
beforeEach(()=>{vi.clearAllMocks();mocks.statLocal.mockResolvedValue(null);mocks.statInDir.mockResolvedValue(null);mocks.upload.mockResolvedValue({type:'verify_nid',user_id:7});mocks.session.mockResolvedValue(null);mocks.access.mockResolvedValue(false);mocks.topup.mockResolvedValue({user_id:7n});});
describe('private document canonical-path boundary',()=>{
  it('rejects a remaining encoded alias before it can reach a legacy HTTP fallback',async()=>{
    const response=await GET(new NextRequest('https://example.test/media/alias'),{params:Promise.resolve({path:['uploads','%2e%2e%2fuploads%2fverify_nid_7.pdf']})});
    expect(response.status).toBe(404);expect(response.headers.get('cache-control')).toBe('no-store');expect(mocks.statLocal).not.toHaveBeenCalled();expect(mocks.statInDir).not.toHaveBeenCalled();
  });
  it.each([['uploads','x/../verify_nid_7.pdf'],['uploads','/verify_nid_7.pdf'],['uploads','./verify_nid_7.pdf'],['uploads','x','..','verify_nid_7.pdf'],['uploads\\verify_nid_7.pdf'],['uploads','verify_nid_7.pdf\0']])('rejects decoded alias path before every storage lookup: %j',async(...parts:string[])=>{
    const response=await GET(new NextRequest('https://example.test/media/alias'),{params:Promise.resolve({path:parts})});
    expect(response.status).toBe(404);expect(response.headers.get('cache-control')).toBe('no-store');expect(mocks.statLocal).not.toHaveBeenCalled();expect(mocks.statInDir).not.toHaveBeenCalled();
  });
  it('canonical verification path denies anonymous access before storage',async()=>{
    const r=await GET(new NextRequest('https://example.test/media/uploads/verify_nid_7.pdf'),{params:Promise.resolve({path:['uploads','verify_nid_7.pdf']})});
    expect(r.status).toBe(404);expect(mocks.statLocal).not.toHaveBeenCalled();
  });
  it('canonical owner access still reaches storage, while another ordinary member cannot',async()=>{
    mocks.session.mockResolvedValue({uid:7});await GET(new NextRequest('https://example.test/media/file'),{params:Promise.resolve({path:['uploads','verify_nid_7.pdf']})});
    expect(mocks.statLocal).toHaveBeenCalledWith('uploads/verify_nid_7.pdf');vi.clearAllMocks();
    mocks.session.mockResolvedValue({uid:8});mocks.upload.mockResolvedValue({type:'verify_nid',user_id:7});mocks.access.mockResolvedValue(false);
    await GET(new NextRequest('https://example.test/media/file'),{params:Promise.resolve({path:['uploads','verify_nid_7.pdf']})});
    expect(mocks.statLocal).not.toHaveBeenCalled();expect(mocks.access).toHaveBeenCalledWith(8,'verifications','view');
  });
  it('public canonical advertising image keeps its public path',async()=>{
    await GET(new NextRequest('https://example.test/media/uploads/ad_7.jpg'),{params:Promise.resolve({path:['uploads','ad_7.jpg']})});
    expect(mocks.statLocal).toHaveBeenCalledWith('uploads/ad_7.jpg');expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe('private topup receipt boundary',()=>{
 const path=['uploads','topup_7_1700000000000.pdf'];
 const request=()=>GET(new NextRequest('https://example.test/media/'+path.join('/')),{params:Promise.resolve({path})});
 it('blocks anonymous receipt reads before file and database lookup',async()=>{const r=await request();expect(r.status).toBe(404);expect(r.headers.get('cache-control')).toBe('no-store');expect(mocks.statLocal).not.toHaveBeenCalled();expect(mocks.topup).not.toHaveBeenCalled();});
 it('allows only the database-bound owner and keeps lookup read-only',async()=>{mocks.session.mockResolvedValue({uid:7});await request();expect(mocks.topup).toHaveBeenCalledWith({where:{receipt:path.join('/'),user_id:7n},select:{user_id:true}});expect(mocks.statLocal).toHaveBeenCalledWith(path.join('/'));expect(mocks.access).not.toHaveBeenCalled();});
 it('blocks another member even if they know the file name',async()=>{mocks.session.mockResolvedValue({uid:8});await request();expect(mocks.statLocal).not.toHaveBeenCalled();expect(mocks.access).toHaveBeenCalledWith(8,'topups','view');});
 it('allows a staff member only through topup read permission',async()=>{mocks.session.mockResolvedValue({uid:8});mocks.access.mockResolvedValue(true);await request();expect(mocks.statLocal).toHaveBeenCalledWith(path.join('/'));expect(mocks.access).toHaveBeenCalledWith(8,'topups','view');});
 it('fails closed when ownership lookup fails',async()=>{mocks.session.mockResolvedValue({uid:7});mocks.topup.mockRejectedValue(Error('private db details'));const r=await request();expect(r.status).toBe(404);expect(mocks.statLocal).not.toHaveBeenCalled();});
 it('does not trust an unregistered filename, including for authorized staff',async()=>{mocks.session.mockResolvedValue({uid:8});mocks.access.mockResolvedValue(true);mocks.topup.mockResolvedValue(null);const r=await request();expect(r.status).toBe(404);expect(mocks.statLocal).not.toHaveBeenCalled();});
 it('rejects malformed receipt owner names without looking up storage',async()=>{mocks.session.mockResolvedValue({uid:7});const r=await GET(new NextRequest('https://example.test/media/file'),{params:Promise.resolve({path:['uploads','topup_unbound.pdf']})});expect(r.status).toBe(404);expect(mocks.statLocal).not.toHaveBeenCalled();});
});

it('serves an authorized receipt privately without public cache headers',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'receipt-test-')),file=path.join(dir,'receipt.pdf');
 try{await fs.writeFile(file,'fixture');mocks.session.mockResolvedValue({uid:7});mocks.statLocal.mockResolvedValue({abs:file,size:7});const r=await GET(new NextRequest('https://example.test/media/file'),{params:Promise.resolve({path:['uploads','topup_7_1700000000000.pdf']})});expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(await r.text()).toBe('fixture');}finally{await fs.unlink(file).catch(()=>{});await fs.rmdir(dir);}
});

it('denies ranged receipt requests from anonymous clients before storage',async()=>{const r=await GET(new NextRequest('https://example.test/media/file',{headers:{range:'bytes=0-0'}}),{params:Promise.resolve({path:['uploads','topup_7_1700000000000.pdf']})});expect(r.status).toBe(404);expect(r.headers.get('cache-control')).toBe('no-store');expect(mocks.statLocal).not.toHaveBeenCalled();});
it('fails closed when the staff permission source fails',async()=>{mocks.session.mockResolvedValue({uid:8});mocks.access.mockRejectedValue(Error('private access details'));const r=await GET(new NextRequest('https://example.test/media/file'),{params:Promise.resolve({path:['uploads','topup_7_1700000000000.pdf']})});expect(r.status).toBe(404);expect(mocks.statLocal).not.toHaveBeenCalled();});
