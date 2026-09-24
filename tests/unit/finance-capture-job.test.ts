import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it,vi} from 'vitest';

const path='scripts/release/finance-capture-job.sh';
const credential='synthetic-private-capture-credential-keep-out-of-logs';
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
function script(){expect(existsSync(path),'operator capture job must exist').toBe(true);return readFileSync(path,'utf8');}
async function client(secret=credential,status=200,body:unknown={captured:3},failure=false){
  const source=script().match(/<<'FINANCE_CAPTURE_NODE'\r?\n([\s\S]*?)\r?\nFINANCE_CAPTURE_NODE/)?.[1];
  expect(source,'container program must be supplied on stdin').toBeDefined();
  let output='';const process={env:{FINANCE_CAPTURE_SECRET:secret},exitCode:0,stdout:{write:(value:string)=>{output+=value;}}};
  const fetch=vi.fn(async()=>{if(failure)throw Error(credential);return {status,text:async()=>JSON.stringify(body)};});
  const timeout=vi.fn(()=>({timeout:true}));
  await runInNewContext(source!,{process,fetch,AbortSignal:{timeout}},{timeout:1000});
  return {output,process,fetch,timeout};
}
function host(response:string,exitCode=0,locked=false,args=''){
  const mocks=`fixture_lock=$(mktemp)
trap 'rm -f "$fixture_lock"' EXIT
flock(){ [[ "$*" == '-n 9' ]] || return 99; return "$LOCKED"; }
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
  const source=script().replace('9>/run/lock/trbhh-finance-capture.lock','9>"$fixture_lock"');
  return spawnSync(bash,['-c',mocks+source],{encoding:'utf8',timeout:10000,env:{...process.env,DOCKER_RESPONSE:response,DOCKER_STATUS:String(exitCode),LOCKED:locked?'1':'0',PRIVATE_SENTINEL:credential,FINANCE_CAPTURE_SECRET:credential}});
}

describe('operator finance capture job',()=>{
  it('makes one loopback-only POST using the container credential and refuses redirects',async()=>{
    const result=await client();
    expect(result.fetch).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:3000/api/internal/finance/capture',{
      method:'POST',headers:{Authorization:'Bearer '+credential},redirect:'error',signal:{timeout:true},
    });
    expect(result.timeout).toHaveBeenCalledExactlyOnceWith(55000);
    expect(result.output).toBe('finance_capture status=ok captured=3\n');expect(result.process.exitCode).toBe(0);
  });
  it.each(['','short'])('rejects an unconfigured credential before any request',async secret=>{
    const result=await client(secret);expect(result.fetch).not.toHaveBeenCalled();expect(result.process.exitCode).toBe(1);
    expect(result.output).toBe('finance_capture status=not_configured\n');
  });
  it.each([401,503])('reports HTTP %i without exposing response contents',async status=>{
    const result=await client(credential,status,{error:credential});expect(result.process.exitCode).toBe(1);
    expect(result.output).toBe(`finance_capture status=http_${status}\n`);expect(result.output).not.toContain(credential);
  });
  it('reports an approved failure category without exposing response contents',async()=>{
    const result=await client(credential,503,{error:'finance_capture_unavailable',category:'finance_period_closed'});
    expect(result.process.exitCode).toBe(1);
    expect(result.output).toBe('finance_capture status=http_503_finance_period_closed\n');
    expect(result.output).not.toContain(credential);
  });
  it.each([{captured:-1},{captured:1.5},{captured:credential},{captured:Number.MAX_SAFE_INTEGER+1},null])('rejects malformed counts',async body=>{
    const result=await client(credential,200,body);expect(result.process.exitCode).toBe(1);
    expect(result.output).toBe('finance_capture status=invalid_response\n');
  });
  it('redacts network exceptions and does not retry',async()=>{
    const result=await client(credential,200,null,true);expect(result.fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('finance_capture status=unavailable\n');expect(result.process.exitCode).toBe(1);
  });
  it('passes no credential in Docker argv and emits only a validated successful count',()=>{
    const result=host('finance_capture status=ok captured=3');expect(result.status,result.stderr).toBe(0);
    expect(result.stdout).toBe('finance_capture status=ok captured=3\n');expect(result.stderr).toBe('');
  });
  it('skips an overlapping host execution without invoking Docker',()=>{
    const result=host(credential,0,true);expect(result.status).toBe(0);
    expect(result.stdout).toBe('finance_capture status=skipped_overlap\n');expect(result.stderr).toBe('');
  });
  it.each([0,1])('redacts unexpected Docker output even with exit status %i',code=>{
    const result=host(credential,code);expect(result.status).toBe(1);
    expect(result.stdout).toBe('finance_capture status=unavailable\n');expect(result.stderr).toBe('');
  });
  it('preserves a recognized failure without printing diagnostics',()=>{
    const result=host('finance_capture status=http_503',1);expect(result.status).toBe(1);
    expect(result.stdout).toBe('finance_capture status=http_503\n');expect(result.stderr).toBe('');
  });
  it('preserves a classified failure without printing diagnostics',()=>{
    const result=host('finance_capture status=http_503_finance_period_closed',1);expect(result.status).toBe(1);
    expect(result.stdout).toBe('finance_capture status=http_503_finance_period_closed\n');expect(result.stderr).toBe('');
  });
  it('rejects command arguments instead of accepting alternate destinations or credentials',()=>{
    const result=host(credential,0,false,'unexpected');expect(result.status).toBe(1);
    expect(result.stdout).toBe('finance_capture status=unavailable\n');expect(result.stderr).toBe('');
  });
  it('passes an optional blank-by-default secret through Compose without enabling live orders',()=>{
    expect(readFileSync('docker-compose.yml','utf8')).toContain('FINANCE_CAPTURE_SECRET: ${FINANCE_CAPTURE_SECRET:-}');
    expect(readFileSync('.env.example','utf8')).toMatch(/^FINANCE_CAPTURE_SECRET=\s*$/m);
    expect(readFileSync('.env.example','utf8')).toContain('SUPPLIER_ALLOW_LIVE_ORDERS=false');
  });
});
