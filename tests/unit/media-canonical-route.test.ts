import {beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({statLocal:vi.fn(),statInDir:vi.fn(),upload:vi.fn(),session:vi.fn(),access:vi.fn()}));
vi.mock('@/lib/storage',()=>({statLocal:mocks.statLocal,statInDir:mocks.statInDir}));
vi.mock('@/lib/upload-normalize',()=>({isHeicBytes:()=>false,heicBytesToJpeg:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{uploads:{findFirst:mocks.upload}}}));
vi.mock('@/lib/auth',()=>({getSession:mocks.session}));
vi.mock('@/lib/access-control/guards',()=>({hasAccess:mocks.access}));
import {GET} from '@/app/media/[...path]/route';
beforeEach(()=>{vi.clearAllMocks();mocks.statLocal.mockResolvedValue(null);mocks.statInDir.mockResolvedValue(null);mocks.upload.mockResolvedValue({type:'verify_nid',user_id:7});mocks.session.mockResolvedValue(null);mocks.access.mockResolvedValue(false);});
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
