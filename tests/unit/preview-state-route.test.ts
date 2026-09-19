import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({session: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn()}));
vi.mock('@/lib/auth', () => ({getSession: mock.session}));
vi.mock('@/lib/prisma', () => ({prisma: {preview_states: {findMany: mock.findMany, create: mock.create, updateMany: mock.updateMany}}}));
import {GET, PUT} from '../../src/app/api/preview-state/route';
function request(value: unknown, origin = 'https://preview.example.test') {
  return new Request('https://preview.example.test/api/preview-state', {method:'PUT', headers:{host:'preview.example.test',origin,'content-type':'application/json'},body:JSON.stringify(value)});
}
beforeEach(() => {
  vi.stubEnv('PREVIEW_SANDBOX','true'); vi.stubEnv('DATABASE_URL','mysql://test:test@preview-db/trbhh_preview_v2');
  vi.clearAllMocks(); mock.session.mockResolvedValue({uid:1001}); mock.findMany.mockResolvedValue([]);
  mock.create.mockResolvedValue({}); mock.updateMany.mockResolvedValue({count:1});
});
describe('sandbox state endpoint', () => {
  it('is unavailable outside sandbox and never queries state', async () => {
    vi.stubEnv('PREVIEW_SANDBOX','false');
    expect((await GET()).status).toBe(404); expect(mock.findMany).not.toHaveBeenCalled();
  });
  it('requires authentication and scopes reads by verified user', async () => {
    mock.session.mockResolvedValueOnce(null); expect((await GET()).status).toBe(401);
    mock.findMany.mockResolvedValue([{key:'ad-draft-v1',value:'null',revision:2}]);
    expect(await (await GET()).json()).toEqual({ownerId:1001,values:{'ad-draft-v1':null},revisions:{'ad-draft-v1':2}});
    expect(mock.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({owner_id:1001})}));
  });
  it('rejects foreign origins and invalid writes without a database mutation', async () => {
    expect((await PUT(new Request('https://preview.example.test/api/preview-state',{method:'PUT',headers:{host:'preview.example.test',origin:'https://preview.example.test','content-type':'text/plain'},body:'{}'}))).status).toBe(415);
    expect((await PUT(request({key:'ad-draft-v1',value:null,revision:0},'https://evil.test'))).status).toBe(403);
    expect((await PUT(request({key:'auth',value:{},revision:0}))).status).toBe(400);
    expect(mock.create).not.toHaveBeenCalled();
  });
  it('creates only its own state and reports a committed revision', async () => {
    expect(await (await PUT(request({ownerId:1001,key:'ad-draft-v1',value:null,revision:0}))).json()).toEqual({revision:1});
    expect(mock.create).toHaveBeenCalledWith({data:{owner_id:1001,key:'ad-draft-v1',value:'null',revision:1}});
  });
  it('fails on concurrent changes without overwriting data', async () => {
    mock.updateMany.mockResolvedValue({count:0});
    expect((await PUT(request({ownerId:1001,key:'seller-ads-v1',value:[],revision:3}))).status).toBe(409);
    expect(mock.updateMany).toHaveBeenCalledWith({where:{owner_id:1001,key:'seller-ads-v1',revision:3},data:{value:'[]',revision:{increment:1}}});
    mock.create.mockRejectedValue({code:'P2002'});
    expect((await PUT(request({ownerId:1001,key:'ad-draft-v1',value:null,revision:0}))).status).toBe(409);
  });
  it.each([0, 3])('rejects a switched owner before any write at revision %i', async revision => {
    mock.session.mockResolvedValue({uid:1002});
    expect((await PUT(request({ownerId:1001,key:'ad-draft-v1',value:null,revision}))).status).toBe(403);
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.updateMany).not.toHaveBeenCalled();
  });
  it.each([undefined, null, '1001', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid ownerId %s without writing', async ownerId => {
    expect((await PUT(request({ownerId,key:'ad-draft-v1',value:null,revision:0}))).status).toBe(400);
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.updateMany).not.toHaveBeenCalled();
  });
});
