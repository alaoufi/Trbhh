import {describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const audit=require('../../scripts/preview/audit-production.cjs');

const fixtures=()=>({
  ads:[{total:2258n,paused:3n,future:1n,archived:20n,deleted:2n,store_only:4n,password:'PRIVATE'}],
  adGroups:[{status_group:'1',state_group:'1',n:2000n},{status_group:'0',state_group:'0',n:200n},{status_group:'private-label',state_group:'private-state',n:58n}],
  users:[{total:42n,archived:2n,banned:1n,phone:'PRIVATE'}],
  stores:[{total:5n,missing_owner:1n,name:'PRIVATE'}],
  storeGroups:[{status_group:1,n:3n},{status_group:3,n:1n},{status_group:'PRIVATE',n:1n}],
  productLinks:[{total:7n,missing_store:2n,missing_ad:1n,missing_both:1n,id:987654}],
});
function client(guard?:unknown) {
  const guardValue=arguments.length?guard:1n;
  const calls:string[]=[]; const raw=fixtures();
  const tx={$queryRawUnsafe:vi.fn(async(sql:string)=>{
    calls.push(sql);
    if(sql===audit.GUARD_QUERY)return [{read_only:guardValue}];
    const key=Object.keys(audit.QUERIES).find(key=>audit.QUERIES[key]===sql) as keyof typeof raw;
    if(!key)throw new Error('Unexpected SQL');
    return raw[key];
  })};
  const db={
    $executeRawUnsafe:vi.fn(async(sql:string)=>{calls.push(sql);return 0;}),
    $transaction:vi.fn(async(fn:(t:typeof tx)=>Promise<unknown>, _options?:unknown)=>fn(tx)),
    $disconnect:vi.fn(async()=>{}),
  };
  return {db,tx,calls};
}
describe('production aggregate audit',()=>{
  it.each(['stdin','file'])('runs the %s CLI entry without exposing environment or errors',mode=>{
    const script=require.resolve('../../scripts/preview/audit-production.cjs');
    const result=spawnSync(process.execPath,mode==='stdin'?[]:[script],{
      input:mode==='stdin'?readFileSync(script,'utf8'):undefined,
      env:{...process.env,DATABASE_URL:'',NODE_OPTIONS:''},encoding:'utf8',timeout:10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('{"error":"production_audit_failed"}\n');
    expect(result.stderr).toBe('');
  });
  it('does not begin a transaction or query tables if read-only setup fails',async()=>{
    const {db,tx}=client();
    db.$executeRawUnsafe.mockRejectedValue(new Error('setup denied'));
    await expect(audit.executeAudit(db)).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
  });
  it.each([1,1n,'1'])('accepts only an exact numeric read-only guard (%s)',async guard=>{
    const {db}=client(guard);
    expect((await audit.executeAudit(db)).version).toBe(1);
  });
  it.each([0,0n,'0',null,undefined,'true',2])('denies a non-read-only session (%s) before table queries',async guard=>{
    const {db,calls}=client(guard);
    await expect(audit.executeAudit(db)).rejects.toThrow('Read-only guard failed');
    expect(calls).toEqual(['SET SESSION TRANSACTION READ ONLY',audit.GUARD_QUERY]);
  });
  it('pins setup before a guarded RepeatableRead transaction and only runs fixed SELECTs',async()=>{
    const {db,calls}=client();
    const result=await audit.executeAudit(db);
    expect(db.$transaction.mock.calls[0][1]).toMatchObject({isolationLevel:'RepeatableRead'});
    expect(calls).toEqual(['SET SESSION TRANSACTION READ ONLY',audit.GUARD_QUERY,...Object.values(audit.QUERIES)]);
    for(const sql of calls.slice(1)) {
      expect(sql).toMatch(/^SELECT\s/i);
      expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|REPLACE|INTO|CALL|SHOW|password|phone|email|settings)\b|;/i);
    }
    expect(result.ads.total).toBe(2258);
    expect(result.product_links).toEqual({total:7,missing_store:2,missing_ad:1,missing_both:1});
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|private-label|private-state|987654|password|phone/);
  });
  it('shapes fixed numeric aggregates and normalizes only exact known raw labels',()=>{
    const raw=fixtures();
    raw.adGroups.push({status_group:'01',state_group:'active',n:2n});
    const result=audit.shapeAggregates(raw);
    expect(Object.keys(result.ads.by_status_state)).toEqual(['0','1','2','3','other']);
    expect(result.ads.by_status_state['1']).toEqual({inactive:0,active:2000,other:0});
    expect(result.ads.by_status_state['0']).toEqual({inactive:200,active:0,other:0});
    expect(result.ads.by_status_state.other.other).toBe(60);
    expect(result.stores.by_status).toEqual({'0':0,'1':3,'2':0,'3':1,other:1});
    expect(result.users).toEqual({total:42,archived:2,banned:1});
    function numericLeaves(value:unknown) {
      if(value && typeof value==='object')Object.values(value).forEach(numericLeaves);
      else expect(typeof value).toBe('number');
    }
    numericLeaves(result);
  });
  it.each([-1,1.2,'1e3','secret',null,undefined,9007199254740992n])('rejects malformed or unsafe count %s without echoing it',value=>{
    const raw=fixtures();Object.assign(raw.ads[0],{total:value});
    expect(()=>audit.shapeAggregates(raw)).toThrow('Invalid aggregate result');
  });
  it('forces one pool connection without returning the URL in output',()=>{
    const options=audit.clientOptions('mysql://member:PRIVATE@db:3306/site?connection_limit=9');
    expect(new URL(options.datasources.db.url).searchParams.getAll('connection_limit')).toEqual(['1']);
    expect(options.log).toEqual([]);
    expect(()=>audit.clientOptions('not-a-url-PRIVATE')).toThrow('Invalid audit configuration');
  });
  it('CLI errors and disconnect failures return only a fixed JSON failure, never raw details',async()=>{
    const {db}=client();
    db.$transaction.mockRejectedValue(new Error('PRIVATE mysql://password@host row name'));
    db.$disconnect.mockRejectedValue(new Error('PRIVATE disconnect'));
    const output:string[]=[];
    const code=await audit.runCli({databaseUrl:'mysql://member:PRIVATE@db/site',createClient:()=>db,write:(text:string)=>output.push(text)});
    expect(code).toBe(1);expect(output).toEqual(['{"error":"production_audit_failed"}\n']);
    expect(db.$disconnect).toHaveBeenCalledOnce();
  });
  it('CLI success emits a single shaped JSON document only after disconnect',async()=>{
    const {db}=client();const output:string[]=[];
    const code=await audit.runCli({databaseUrl:'mysql://member:PRIVATE@db/site',createClient:()=>db,write:(text:string)=>{expect(db.$disconnect).toHaveBeenCalledOnce();output.push(text);}});
    expect(code).toBe(0);expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]).ads.total).toBe(2258);
    expect(output[0]).not.toContain('PRIVATE');
  });
  it('invalid CLI configuration fails before constructing a client',async()=>{
    const createClient=vi.fn(),write=vi.fn();
    expect(await audit.runCli({databaseUrl:'PRIVATE-invalid',createClient,write})).toBe(1);
    expect(createClient).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledExactlyOnceWith('{"error":"production_audit_failed"}\n');
  });
});
