import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {describe,it,expect,vi} from 'vitest';
const require=createRequire(import.meta.url);
const env={SUPPLIER_PUBLIC_ORIGIN:'https://trbhh.sa',SUPPLIER_ALLOW_LIVE_ORDERS:'false',SALLA_WEBHOOK_SECRET:'synthetic-only'};
describe('Salla harmless endpoint smoke',()=>{
 it('executes via node stdin and fails without runtime settings, with code-only output',()=>{
  const result=spawnSync(process.execPath,['-'],{encoding:'utf8',input:readFileSync('scripts/release/salla-smoke.cjs','utf8'),env:{...process.env,SUPPLIER_PUBLIC_ORIGIN:'',SUPPLIER_ALLOW_LIVE_ORDERS:'false',SALLA_WEBHOOK_SECRET:''}});
  expect(result.status).toBe(1);expect(result.stderr).toBe('');expect(JSON.parse(result.stdout)).toEqual({codes:['unsafe_runtime']});
 });
 it('bounds stalled fetch time and aborts without exposing the underlying error',async()=>{
  vi.useFakeTimers();
  try{
   const {runSmoke}=require('../../scripts/release/salla-smoke.cjs');const fetcher=vi.fn(()=>new Promise(()=>{}));
   const result=runSmoke(env,fetcher);await vi.advanceTimersByTimeAsync(8000);
   expect(await result).toEqual({codes:['callback_probe_failed']});expect(fetcher.mock.calls[0]).toBeDefined();
  }finally{vi.useRealTimers();}
 });
 it.each([{...env,SALLA_WEBHOOK_SECRET:''},{...env,SUPPLIER_PUBLIC_ORIGIN:'https://other.test'},{...env,SUPPLIER_ALLOW_LIVE_ORDERS:'true'}])('rejects unsafe runtime before fetching',async config=>{
  const {runSmoke}=require('../../scripts/release/salla-smoke.cjs');const fetcher=vi.fn();
  expect(await runSmoke(config,fetcher)).toEqual({codes:['unsafe_runtime']});expect(fetcher).not.toHaveBeenCalled();
 });
 it('uses only fixed anonymous routes and a signed ignored event, then an invalid signature',async()=>{
  const {runSmoke}=require('../../scripts/release/salla-smoke.cjs');
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('{}',{status:403})).mockResolvedValueOnce(new Response('{}',{status:401})).mockResolvedValueOnce(new Response('{"received":true}',{status:200})).mockResolvedValueOnce(new Response('{}',{status:400}));
  expect(await runSmoke(env,fetcher)).toEqual({codes:['callback_forbidden','unsigned_rejected','signed_ignored_received','invalid_signature_rejected']});
  for(const [url,options] of fetcher.mock.calls){expect(url).toMatch(/^https:\/\/trbhh\.sa\/api\/integrations\/salla\/(callback|webhooks)$/);expect(options).toMatchObject({redirect:'error',credentials:'omit'});expect(options.signal).toBeInstanceOf(AbortSignal);expect(options.headers).not.toHaveProperty('cookie');}
  const signed=fetcher.mock.calls[2][1];const payload=JSON.parse(signed.body);
  expect(payload).toEqual({event:'trbhh.integration.healthcheck',merchant:'0',created_at:expect.any(String),data:{}});
  expect(signed.headers['x-salla-signature']).toBe(createHmac('sha256',env.SALLA_WEBHOOK_SECRET).update(signed.body).digest('hex'));
  expect(fetcher.mock.calls[3][1].headers['x-salla-signature']).not.toBe(signed.headers['x-salla-signature']);
 });
 it.each(['status','oversize','malformed','network'])('returns only a fixed failure code for %s',async failure=>{
  const {runSmoke}=require('../../scripts/release/salla-smoke.cjs');
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('{}',{status:403})).mockResolvedValueOnce(new Response('{}',{status:401}));
  if(failure==='network')fetcher.mockRejectedValueOnce(new Error('private-token-body'));
  else fetcher.mockResolvedValueOnce(new Response(failure==='oversize'?'x'.repeat(4097):'private-token-body',{status:failure==='status'?302:200}));
  const result=await runSmoke(env,fetcher);expect(result).toEqual({codes:['signed_probe_failed']});expect(JSON.stringify(result)).not.toContain('private-token');expect(fetcher).toHaveBeenCalledTimes(3);
 });
});
