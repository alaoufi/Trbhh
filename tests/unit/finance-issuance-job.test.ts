import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it,vi} from 'vitest';

const path='scripts/release/finance-issuance-job.sh';
const credential='synthetic-private-issuance-credential-keep-out-of-logs';
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
function script(){expect(existsSync(path),'operator issuance job must exist').toBe(true);return readFileSync(path,'utf8');}
async function client(secret=credential,status=200,body:unknown={issued:3,pending:2,failed:1},failure=false){
 const source=script().match(/<<'FINANCE_ISSUANCE_NODE'\r?\n([\s\S]*?)\r?\nFINANCE_ISSUANCE_NODE/)?.[1];expect(source).toBeDefined();
 let output='';const process={env:{FINANCE_ISSUANCE_SECRET:secret,FINANCE_CAPTURE_SECRET:'capture-credential-is-not-issuance-authorization'},exitCode:0,stdout:{write:(value:string)=>{output+=value;}}};
 const fetch=vi.fn(async()=>{if(failure)throw Error(credential);return {status,json:async()=>body};}),timeout=vi.fn(()=>({timeout:true}));
 await runInNewContext(source!,{process,fetch,AbortSignal:{timeout}},{timeout:1000});return {output,process,fetch,timeout};
}
function host(response:string,exitCode=0,lockStatus=0,args=''){
 const mocks=`fixture_lock=$(mktemp)
trap 'rm -f "$fixture_lock"' EXIT
flock(){ [[ "$*" == '-n 9' ]] || return 99; return "$LOCK_STATUS"; }
timeout(){ [[ "$1" == '75s' ]] || return 99; shift; "$@"; }
docker(){
 [[ "$*" == 'compose exec -T app node -' ]] || return 99
 cat >/dev/null
 printf '%s\\n' "$DOCKER_RESPONSE"
 printf '%s\\n' "$PRIVATE_SENTINEL" >&2
 return "$DOCKER_STATUS"
}
set -- ${args}
`;
 const source=script().replace('9>/run/lock/trbhh-finance-issuance.lock','9>"$fixture_lock"');
 return spawnSync(bash,['-c',mocks+source],{encoding:'utf8',timeout:10000,env:{...process.env,DOCKER_RESPONSE:response,DOCKER_STATUS:String(exitCode),LOCK_STATUS:String(lockStatus),PRIVATE_SENTINEL:credential}});
}
describe('operator invoice issuance job',()=>{
 it('posts only to the fixed loopback endpoint with the separate container credential and no redirects',async()=>{
  const result=await client();expect(result.fetch).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:3000/api/finance/issue',{method:'POST',headers:{Authorization:'Bearer '+credential},redirect:'error',signal:{timeout:true}});expect(result.timeout).toHaveBeenCalledExactlyOnceWith(55000);
  expect(result.output).toBe('finance_issuance status=ok issued=3 pending=2 failed=1\n');expect(result.process.exitCode).toBe(0);
 });
 it.each(['','short'])('does not use capture credentials when issuance is unconfigured',async secret=>{
  const result=await client(secret);expect(result.fetch).not.toHaveBeenCalled();expect(result.output).toBe('finance_issuance status=not_configured\n');expect(result.process.exitCode).toBe(1);
 });
 it.each([401,503])('reports only HTTP %i without response contents',async status=>{
  const result=await client(credential,status,{error:credential});expect(result.output).toBe(`finance_issuance status=http_${status}\n`);expect(result.process.exitCode).toBe(1);
 });
 it.each([{issued:-1,pending:0,failed:0},{issued:0,pending:1.5,failed:0},{issued:0,pending:0,failed:credential},{issued:Number.MAX_SAFE_INTEGER+1,pending:0,failed:0},{issued:0,pending:0},null])('rejects malformed counts',async body=>{
  const result=await client(credential,200,body);expect(result.output).toBe('finance_issuance status=invalid_response\n');expect(result.process.exitCode).toBe(1);
 });
 it('redacts network exceptions and does not retry',async()=>{
  const result=await client(credential,200,null,true);expect(result.fetch).toHaveBeenCalledTimes(1);expect(result.output).toBe('finance_issuance status=unavailable\n');expect(result.process.exitCode).toBe(1);
 });
 it('passes no secret in Docker arguments and whitelists only successful counts',()=>{
  const result=host('finance_issuance status=ok issued=3 pending=2 failed=1');expect(result.status,result.stderr).toBe(0);expect(result.stdout).toBe('finance_issuance status=ok issued=3 pending=2 failed=1\n');expect(result.stderr).toBe('');
 });
 it('skips a competing host execution without calling Docker',()=>{
  const result=host(credential,0,1);expect(result.status).toBe(0);expect(result.stdout).toBe('finance_issuance status=skipped_overlap\n');expect(result.stderr).toBe('');
 });
 it('fails closed on lock errors instead of treating them as overlap',()=>{
  const result=host(credential,0,2);expect(result.status).toBe(1);expect(result.stdout).toBe('finance_issuance status=unavailable\n');expect(result.stderr).toBe('');
 });
 it.each([0,1])('redacts unrecognized Docker output with status %i',code=>{
  const result=host(credential,code);expect(result.status).toBe(1);expect(result.stdout).toBe('finance_issuance status=unavailable\n');expect(result.stderr).toBe('');
 });
 it('returns a known failure without private diagnostics or extra output lines',()=>{
  const result=host('finance_issuance status=http_503',1);expect(result.status).toBe(1);expect(result.stdout).toBe('finance_issuance status=http_503\n');expect(result.stderr).toBe('');
  const extra=host('finance_issuance status=http_503\n'+credential,1);expect(extra.stdout).toBe('finance_issuance status=unavailable\n');
 });
 it('refuses arguments and never installs scheduling or alters live commerce gates',()=>{
  const result=host(credential,0,0,'unexpected');expect(result.status).toBe(1);expect(result.stdout).toBe('finance_issuance status=unavailable\n');
  expect(script()).not.toMatch(/systemctl|systemd-run|crontab|SUPPLIER_ALLOW_LIVE_ORDERS|commerce_purchasing_enabled/);
 });
 it('passes only the blank-by-default separate secret through Compose with live orders disabled',()=>{
  expect(readFileSync('docker-compose.yml','utf8')).toContain('FINANCE_ISSUANCE_SECRET: ${FINANCE_ISSUANCE_SECRET:-}');
  expect(readFileSync('.env.example','utf8')).toMatch(/^FINANCE_ISSUANCE_SECRET=\s*$/m);expect(readFileSync('.env.example','utf8')).toContain('SUPPLIER_ALLOW_LIVE_ORDERS=false');
 });
 it('parses as Bash',()=>{const result=spawnSync(bash,['-n',path],{encoding:'utf8'});expect(result.status,result.stderr).toBe(0);});
});
