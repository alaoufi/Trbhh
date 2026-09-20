import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {CommerceDb} from '@/lib/commerce/types';
import type {SupplierConfig} from '@/lib/suppliers/config';
vi.mock('@/lib/suppliers/connections',()=>({accessTokenForConnection:vi.fn()}));
import {accessTokenForConnection} from '@/lib/suppliers/connections';
import {getSupplierReadiness,testSupplierReadiness} from '@/lib/suppliers/readiness';
import {sealTokens} from '@/lib/suppliers/crypto';

const config:SupplierConfig={origin:'https://trbhh.com',clientId:'client',clientSecret:'client-secret',encryptionKey:Buffer.alloc(32,7).toString('hex'),webhookSecret:'',cronSecret:'',liveOrders:false};
const product={id:3,name:'Sample',price:{amount:'12.50',currency:'SAR'},quantity:4,status:'sale',is_available:true};
function fixture(){
  const connection={id:1n,supplier_id:2n,provider:'salla',external_store_id:'123',status:'connected',active:1,maintenance:0,version:7,
    encrypted_tokens:sealTokens({accessToken:'private-access-token',refreshToken:'private-refresh-token'},'salla:2:123',config.encryptionKey),expires_at:new Date(Date.now()+3600000),refresh_claim:null as string|null,refresh_claimed_at:null as Date|null};
  const row={checked_connection_version:null as number|null,checked_at:null as Date|null,check_status:'pending',check_code:'',check_sample_count:0,check_claim:null as string|null,check_claimed_at:null as Date|null};
  const writes:{sql:string;values:unknown[]}[]=[];
  const audit=vi.fn();
  let connections=[connection];
  let registered=true;
  const query=vi.fn(async(strings:TemplateStringsArray)=>{
    const sql=strings.join('?');
    if(sql.includes('FROM supplier_connections'))return connections.map(c=>({...c}));
    if(sql.includes('FROM supplier_onboarding'))return registered?[{...row}]:[];
    throw new Error('Unexpected SQL');
  });
  const execute=vi.fn(async(strings:TemplateStringsArray,...values:unknown[])=>{
    const sql=strings.join('?');writes.push({sql,values});
    if(sql.startsWith('UPDATE supplier_connections SET refresh_claim=')){
      connection.refresh_claim=String(values[0]);connection.refresh_claimed_at=new Date();return 1;
    }
    if(sql.startsWith('UPDATE supplier_connections SET encrypted_tokens=')){
      if(connection.refresh_claim!==values[3]||connection.version!==values[4])return 0;
      connection.encrypted_tokens=String(values[0]);connection.expires_at=values[1] as Date;connection.version++;connection.refresh_claim=null;connection.refresh_claimed_at=null;return 1;
    }
    if(sql.startsWith('INSERT'))return 1;
    if(sql.includes(",check_status='running',")){
      row.check_claim=String(values[0]);row.check_claimed_at=new Date();row.check_status='running';
      row.checked_at=null;row.checked_connection_version=null;row.check_code='';row.check_sample_count=0;return 1;
    }
    if(sql.includes('SET o.check_status=')){
      const [status,code,count,version,,claim,id,expectedVersion]=values;
      if(row.check_claim!==claim||row.check_status!=='running')return 0;
      if(sql.includes('o.check_claimed_at>')&&(!row.check_claimed_at||row.check_claimed_at.getTime()<=Date.now()-120000))return 0;
      if(connections.length!==1||connection.id!==id||connection.version!==expectedVersion||connection.status!=='connected'||connection.active!==1||connection.maintenance!==0)return 0;
      Object.assign(row,{check_status:status,check_code:code,check_sample_count:count,checked_connection_version:version,checked_at:new Date(),check_claim:null,check_claimed_at:null});return 1;
    }
    if(sql.includes('SET check_status=')){
      const [status,code,,claim]=values;
      if(row.check_claim!==claim||row.check_status!=='running')return 0;
      Object.assign(row,{check_status:status,check_code:code,check_sample_count:0,checked_connection_version:null,checked_at:new Date(),check_claim:null,check_claimed_at:null});return 1;
    }
    throw new Error('Unexpected write');
  });
  const tx={$queryRaw:query,$executeRaw:execute,admin_log:{create:audit}};
  let queue=Promise.resolve<unknown>(undefined);
  const db={$queryRaw:query,$transaction:vi.fn((fn:(t:typeof tx)=>unknown)=>{
    const next=queue.then(()=>fn(tx));queue=next.catch(()=>undefined);return next;
  })} as unknown as CommerceDb;
  const fetcher=vi.fn<typeof fetch>(async url=>String(url).includes('/user/info')
    ?Response.json({success:true,data:{merchant:{id:123}}})
    :Response.json({success:true,data:[product],pagination:{currentPage:1,totalPages:2}}));
  return {db,connection,row,writes,audit,fetcher,execute,setConnections:(value:typeof connections)=>{connections=value;},unregister:()=>{registered=false;}};
}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(accessTokenForConnection).mockResolvedValue('private-access-token');});

describe('bounded supplier readiness',()=>{
  it('checks identity and one parsed product using GET only, without following pagination or importing',async()=>{
    const f=fixture();const result=await testSupplierReadiness(f.db,2n,9n,config,f.fetcher);
    expect(result).toEqual({status:'ready',code:'supplier_readiness_ok',sampleCount:1});
    expect(f.fetcher.mock.calls.map(([url,init])=>[String(url),init?.method??'GET'])).toEqual([
      ['https://accounts.salla.sa/oauth2/user/info','GET'],['https://api.salla.dev/admin/v2/products?page=1&per_page=1','GET']]);
    expect(f.row.check_status).toBe('ready');expect(f.row.check_claim).toBeNull();
    expect(f.writes.every(w=>/^INSERT INTO supplier_onboarding|^UPDATE supplier_onboarding/.test(w.sql))).toBe(true);
    expect(f.audit).toHaveBeenCalledWith({data:{admin_id:9n,action:'supplier_readiness_check',target:'2',note:'supplier_readiness_ok'}});
  });
  it('rejects a different merchant before reading products',async()=>{
    const f=fixture();f.fetcher.mockResolvedValue(Response.json({success:true,data:{merchant:{id:999}}}));
    expect(await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).toMatchObject({status:'failed',code:'supplier_readiness_identity_mismatch',sampleCount:0});
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it('explicitly succeeds without a sample for an empty catalog',async()=>{
    const f=fixture();f.fetcher.mockResolvedValueOnce(Response.json({success:true,data:{merchant:{id:123}}})).mockResolvedValueOnce(Response.json({success:true,data:[],pagination:{currentPage:1,totalPages:0}}));
    expect(await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).toMatchObject({status:'ready',code:'supplier_readiness_empty_catalog',sampleCount:0});
  });
  it.each([{price:{amount:'secret-body',currency:'SAR'}},{quantity:-1},{name:''}])('fails closed on malformed parsed product %j',async invalid=>{
    const f=fixture();f.fetcher.mockResolvedValueOnce(Response.json({success:true,data:{merchant:{id:123}}})).mockResolvedValueOnce(Response.json({success:true,data:[{...product,...invalid}],pagination:{currentPage:1,totalPages:1}}));
    expect(await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).toMatchObject({status:'failed',code:'supplier_readiness_catalog_failed'});
  });
  it('never returns or audits provider error text or credentials',async()=>{
    const f=fixture();vi.mocked(accessTokenForConnection).mockRejectedValue(new Error('private-access-token secret-body'));
    const result=await testSupplierReadiness(f.db,2n,9n,config,f.fetcher);
    expect(result).toMatchObject({status:'failed',code:'supplier_readiness_token_failed'});
    expect(JSON.stringify([result,f.writes,f.audit.mock.calls],(_,v)=>typeof v==='bigint'?String(v):v)).not.toMatch(/private-access-token|secret-body/);
  });
  it('accepts the version advanced by token refresh before identity and catalog checks',async()=>{
    const f=fixture();vi.mocked(accessTokenForConnection).mockImplementationOnce(async()=>{f.connection.version++;return 'rotated';});
    expect(await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).toMatchObject({status:'ready'});
    expect(f.row.checked_connection_version).toBe(8);
    expect(accessTokenForConnection).toHaveBeenCalledTimes(2);
  });
  it('durably excludes a concurrent check before any provider call',async()=>{
    const f=fixture();let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});let started!:()=>void;const entered=new Promise<void>(r=>{started=r;});
    vi.mocked(accessTokenForConnection).mockImplementationOnce(async()=>{started();await wait;return 'private-access-token';});
    const first=testSupplierReadiness(f.db,2n,9n,config,f.fetcher);await entered;
    expect(await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).toMatchObject({status:'failed',code:'supplier_readiness_busy'});
    release();expect((await first).status).toBe('ready');expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it('fences completion after a connection changes during GET',async()=>{
    const f=fixture();f.fetcher.mockImplementationOnce(async()=>{f.connection.version++;return Response.json({success:true,data:{merchant:{id:123}}});});
    expect(await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).toMatchObject({status:'failed',code:'supplier_readiness_connection_changed'});
    expect(f.row.check_status).toBe('pending');
    const update=f.writes.find(w=>w.sql.includes('SET o.check_status='))!.sql;
    expect(update).toContain('c.version=');expect(update).toContain("c.status='connected'");expect(update).toContain('o.check_claim=');
  });
  it('does not overwrite a successor claim',async()=>{
    const f=fixture();f.fetcher.mockImplementationOnce(async()=>{f.row.check_claim='successor';return Response.json({success:true,data:{merchant:{id:123}}});});
    expect((await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).status).toBe('failed');expect(f.row.check_claim).toBe('successor');expect(f.audit).not.toHaveBeenCalled();
  });
  it('recovers expired claims',async()=>{
    const f=fixture();f.row.check_claim='abandoned';f.row.check_claimed_at=new Date(Date.now()-600000);f.row.check_status='running';
    expect((await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).status).toBe('ready');
  });
  it.each(['disconnected','reconnect_required'])('does not reconnect %s connections',async status=>{
    const f=fixture();f.connection.status=status;
    expect((await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).status).toBe('failed');expect(accessTokenForConnection).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('rejects ambiguous connections because persistence has no connection id',async()=>{
    const f=fixture();f.setConnections([f.connection,{...f.connection,id:10n,external_store_id:'456'}]);
    expect((await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).code).toBe('supplier_readiness_connection_unavailable');expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('hides a previously ready result after version or status changes',async()=>{
    const f=fixture();await testSupplierReadiness(f.db,2n,9n,config,f.fetcher);
    expect((await getSupplierReadiness(f.db,2n)).status).toBe('ready');f.connection.version++;
    expect(await getSupplierReadiness(f.db,2n)).toMatchObject({status:'pending',sampleCount:0,checkedConnectionVersion:null});
    f.connection.version--;f.connection.status='disconnected';expect((await getSupplierReadiness(f.db,2n)).status).toBe('pending');
  });
  it('uses the existing real refresh service and pins its rotated token for both GETs',async()=>{
    const f=fixture();f.connection.expires_at=new Date(0);
    const real=await vi.importActual<typeof import('@/lib/suppliers/connections')>('@/lib/suppliers/connections');
    vi.mocked(accessTokenForConnection).mockImplementation(real.accessTokenForConnection);
    f.fetcher.mockImplementation(async(url,init)=>{
      if(String(url).endsWith('/oauth2/token')){
        expect(init?.method).toBe('POST');expect(String(init?.body)).toContain('grant_type=refresh_token');
        return Response.json({access_token:'rotated-access',refresh_token:'rotated-refresh',expires_in:3600});
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer rotated-access');
      expect(init?.method??'GET').toBe('GET');
      return String(url).includes('/user/info')?Response.json({success:true,data:{merchant:{id:123}}}):Response.json({success:true,data:[product],pagination:{currentPage:1,totalPages:1}});
    });
    expect(await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).toMatchObject({status:'ready'});
    expect(f.fetcher).toHaveBeenCalledTimes(3);expect(f.row.checked_connection_version).toBe(8);
  });
  it.each(['active','maintenance'])('blocks unavailable %s without provider requests',async field=>{
    const f=fixture();Object.assign(f.connection,{[field]:field==='active'?0:1});
    expect((await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).status).toBe('failed');expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('sanitizes identity HTTP response failures',async()=>{
    const f=fixture();f.fetcher.mockResolvedValue(new Response('secret-body private-access-token',{status:403}));
    expect(await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).toMatchObject({status:'failed',code:'supplier_readiness_identity_failed'});
    expect(f.audit.mock.calls[0][0].data.note).toBe('supplier_readiness_identity_failed');
  });
  it('does not leak storage exception values',async()=>{
    const f=fixture();f.execute.mockRejectedValueOnce(new Error('private-access-token secret-body'));
    await expect(testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).rejects.toThrow(/^supplier_readiness_storage_failed$/);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('hides ready when another Salla connection with the same version appears',async()=>{
    const f=fixture();await testSupplierReadiness(f.db,2n,9n,config,f.fetcher);
    f.setConnections([f.connection,{...f.connection,id:10n,external_store_id:'456'}]);
    expect((await getSupplierReadiness(f.db,2n)).status).toBe('pending');
  });
  it('does not complete a check after its lease expires',async()=>{
    const f=fixture();f.fetcher.mockImplementationOnce(async()=>{f.row.check_claimed_at=new Date(Date.now()-600000);return Response.json({success:true,data:{merchant:{id:123}}});});
    expect((await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).status).toBe('failed');
    expect(f.writes.find(w=>w.sql.includes('SET o.check_status='))?.sql).toContain('o.check_claimed_at>');
  });
  it('throttles repeated completed checks while allowing a changed connection to be retested',async()=>{
    const f=fixture();await testSupplierReadiness(f.db,2n,9n,config,f.fetcher);
    expect(await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).toEqual({status:'failed',code:'supplier_readiness_throttled',sampleCount:0});
    expect(f.fetcher).toHaveBeenCalledTimes(2);expect(f.row.check_status).toBe('ready');
    f.connection.version++;
    expect((await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).status).toBe('ready');expect(f.fetcher).toHaveBeenCalledTimes(4);
  });
  it('requires the registration row and never inserts incomplete mandatory registration fields',async()=>{
    const f=fixture();f.unregister();
    expect(await testSupplierReadiness(f.db,2n,9n,config,f.fetcher)).toEqual({status:'failed',code:'supplier_readiness_registration_missing',sampleCount:0});
    expect(f.writes).toHaveLength(0);expect(f.fetcher).not.toHaveBeenCalled();
    expect((await getSupplierReadiness(f.db,2n)).status).toBe('pending');
  });
});
