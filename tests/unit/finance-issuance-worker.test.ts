import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({issue:vi.fn(),db:{marker:'private-db'}}));
vi.mock('@/lib/prisma',()=>({prisma:mocks.db}));
vi.mock('@/lib/finance/issuance',()=>({issueInvoicesForWorker:mocks.issue}));
import {financeAuditContext} from '@/lib/finance/audit-context';
import {POST} from '@/app/api/finance/issue/route';
const secret='synthetic-dedicated-issuance-secret-not-capture';
beforeEach(()=>{vi.clearAllMocks();mocks.issue.mockResolvedValue({issued:2,pending:3,failed:1});});
const request=(headers:Record<string,string>={})=>new Request('https://app.test/api/finance/issue',{method:'POST',headers,body:JSON.stringify({actorId:'1',policyId:'1',snapshot:'forged'})});

describe('private invoice issuance route',()=>{
 it('delegates only server database and bearer authorization, ignoring browser fiscal fields',async()=>{
  const response=await POST(request({authorization:'Bearer '+secret}));
  expect(mocks.issue).toHaveBeenCalledExactlyOnceWith(mocks.db,'Bearer '+secret);
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({issued:2,pending:3,failed:1});
 });
 it.each([['finance_issuance_not_configured',503,'not_configured'],['finance_issuance_unauthorized',401,'unauthorized'],['private customer policy error '+secret,503,'finance_issuance_unavailable']])('exposes only a safe status for %s',async(error,status,code)=>{
  mocks.issue.mockRejectedValueOnce(Error(error));const response=await POST(request());
  expect(mocks.issue).toHaveBeenCalledExactlyOnceWith(mocks.db,'');expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toEqual({error:code});
 });
 it('returns only counts even when a dependency has extra diagnostic data',async()=>{
  mocks.issue.mockResolvedValueOnce({issued:0,pending:0,failed:1,customer:secret,errors:['private order']});
  const response=await POST(request());expect(await response.json()).toEqual({issued:0,pending:0,failed:1});
 });
 it.each([{issued:-1,pending:0,failed:0},{issued:0,pending:0.5,failed:0},{issued:0,pending:0,failed:secret},{issued:Number.MAX_SAFE_INTEGER+1,pending:0,failed:0},null])('refuses malformed count results',async value=>{
  mocks.issue.mockResolvedValueOnce(value);const response=await POST(request());expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'finance_issuance_unavailable'});
 });
 it.each([['127.0.0.1, 10.0.0.1','127.0.0.1'],['invalid',null]])('records only valid audit IP metadata without credentials or actor overrides',async(header,ip)=>{
  let context:unknown;mocks.issue.mockImplementationOnce(async()=>{context=financeAuditContext();return {issued:0,pending:1,failed:0};});
  await POST(request({authorization:'Bearer '+secret,'x-forwarded-for':header!}));expect(context).toEqual({ip,sessionFingerprint:null});
 });
});
