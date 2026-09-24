'use strict';

const ORIGIN='https://trbhh.sa';
const STREAMING_PAGES=new Set(['/admin/finance','/admin/access-control']);
const REDIRECT_STATUSES=new Set([301,302,303,307,308]);

function header(headers,name) {
  if(typeof headers?.get==='function')return headers.get(name)||'';
  return Object.entries(headers||{}).find(([key])=>key.toLowerCase()===name)?.[1]||'';
}
function directive(headers,name) {
  return String(header(headers,'cache-control')).split(',').some(value=>value.trim().toLowerCase()===name);
}
function safeStatus(status) {return Number.isInteger(status)&&status>=100&&status<=599?status:null;}
function loginTarget(value) {
  if(typeof value!=='string'||!value||/[\s\\]/.test(value))return null;
  try {
    const url=new URL(value,ORIGIN);
    return url.origin===ORIGIN&&!url.username&&!url.password&&!url.hash&&['/login','/account/login'].includes(url.pathname)?url.href:null;
  } catch {return null;}
}
function decodeAttribute(value) {
  // Decode once, as HTML does; unrecognized entities cannot grant an exception.
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi,entity=>{
    const names={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};
    const lower=entity.toLowerCase();if(names[lower])return names[lower];
    const number=lower.startsWith('&#x')?parseInt(lower.slice(3,-1),16):Number(lower.slice(2,-1));
    return number>0&&number<=0x10ffff?String.fromCodePoint(number):'\uFFFD';
  });
}
function attributes(tag) {
  const result={};
  for(const match of tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const key=match[1].toLowerCase();if(Object.hasOwn(result,key))return null;
    result[key]=decodeAttribute(match[2]??match[3]);
  }
  return result;
}
function streamingProof(body) {
  const uncommented=body.replace(/<!--[\s\S]*?-->/g,'');
  // A meta string inside script/template/style text is not an active redirect.
  const markup=uncommented.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  const metas=[...markup.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)].map(match=>match[0]);
  const candidates=metas.filter(tag=>tag.includes('__next-page-redirect'));
  const meta=candidates.length===1?attributes(candidates[0]):null;
  const refresh=meta?.id==='__next-page-redirect'&&meta['http-equiv']?.toLowerCase()==='refresh'?meta.content?.match(/^1;url=(.+)$/):null;
  const target=refresh?loginTarget(refresh[1]):null;
  const otherRefresh=metas.some(tag=>!candidates.includes(tag)&&attributes(tag)?.['http-equiv']?.toLowerCase()==='refresh');
  const digests=[...uncommented.matchAll(/NEXT_REDIRECT;(replace|push);([^"'<>\\\r\n;]*);(307|308);/g)];
  const count=(uncommented.match(/NEXT_REDIRECT;/g)||[]).length;
  const digestMatches=Boolean(target)&&digests.length>0&&digests.length===count&&digests.every(match=>match[3]==='307'&&loginTarget(decodeAttribute(match[2]))===target);
  return {streamingRedirect:Boolean(target)&&!otherRefresh,digestMatches};
}

// Pure policy. The caller cannot opt any API/export/other route into HTML 200 handling.
function assessProtectedResponse({route,status,headers={},body=''}) {
  const base={status:safeStatus(status),noStore:directive(headers,'no-store'),private:directive(headers,'private'),html:/^text\/html(?:\s*;|\s*$)/i.test(header(headers,'content-type'))};
  if(status===401||status===403)return {...base,ok:true,code:'ok',denied:true};
  if(REDIRECT_STATUSES.has(status)) {
    const trustedLogin=Boolean(loginTarget(header(headers,'location')));
    return {...base,ok:trustedLogin,code:trustedLogin?'ok':'protected_redirect',trustedLogin};
  }
  if(status!==200||!STREAMING_PAGES.has(route))return {...base,ok:false,code:'protected_status'};
  if(!base.html||!base.private||!base.noStore||directive(headers,'public'))return {...base,ok:false,code:'protected_stream_headers'};
  const text=String(body),unescaped=text.replace(/\\"/g,'"');
  const adminLayoutAbsent=!/\bid\s*=\s*(?:"(?:admin-content|admin-nav)"|'(?:admin-content|admin-nav)'|(?:admin-content|admin-nav)(?=[\s>]))/i.test(text)&&!/["']id["']\s*:\s*["'](?:admin-content|admin-nav)["']/i.test(unescaped);
  if(!adminLayoutAbsent)return {...base,adminLayoutAbsent,ok:false,code:'protected_admin_content'};
  const proof=streamingProof(text),ok=proof.streamingRedirect&&proof.digestMatches;
  return {...base,adminLayoutAbsent,...proof,ok,code:ok?'ok':'protected_stream_redirect'};
}

async function runPublicVerification({expectedSha,runId,fetchImpl=globalThis.fetch,now=new Date(),onCheck=()=>{}}={}) {
  const checks=[];
  const record=(check,result)=>{const report={check,...result};checks.push(report);onCheck(report);return result.ok;};
  const finish=()=>({ok:checks.every(check=>check.ok),code:checks.find(check=>!check.ok)?.code||'ok',checks});
  if(!/^[a-f0-9]{40}$/.test(expectedSha||'')||!/^[1-9][0-9]{0,19}$/.test(runId||'')||!(now instanceof Date)||!Number.isFinite(now.getTime())) {
    record('configuration',{status:null,ok:false,code:'invalid_configuration'});return finish();
  }
  const month=now.toISOString().slice(0,7);
  const steps=[
    {check:'revision',route:'/api/version?verification='+runId,kind:'revision'},
    {check:'home',route:'/',kind:'home'},
    {check:'finance_page',route:'/admin/finance',kind:'protected'},
    {check:'access_page',route:'/admin/access-control',kind:'protected'},
    {check:'finance_export',route:'/admin/finance/export?format=print&section=tax&month='+month,kind:'protected'},
    {check:'capture_auth',route:'/api/internal/finance/capture',kind:'capture',method:'POST'},
  ];
  for(const step of steps) {
    let response;
    try {
      response=await fetchImpl(ORIGIN+step.route,{method:step.method||'GET',cache:'no-store',redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(15000),headers:{'Cache-Control':'no-cache, no-store'}});
    } catch {
      record(step.check,{status:null,ok:false,code:'network_error'});break;
    }
    const status=safeStatus(response.status);
    let body='';
    if(step.kind==='revision'||step.kind==='home'||(step.kind==='protected'&&status===200&&STREAMING_PAGES.has(step.route))) {
      try {body=await response.text();} catch {record(step.check,{status,ok:false,code:'response_read_error'});break;}
    }
    let result;
    if(step.kind==='revision') {
      let commit;try {commit=JSON.parse(body)?.commit;} catch { /* Fixed failure code; never print the body. */ }
      const noStore=directive(response.headers,'no-store'),revisionMatches=commit===expectedSha;
      const ok=status===200&&noStore&&revisionMatches;
      result={status,noStore,revisionMatches,ok,code:ok?'ok':'public_revision'};
    } else if(step.kind==='home') {
      const bodyPresent=body.length>=100,ok=status===200&&bodyPresent;
      result={status,bodyPresent,ok,code:ok?'ok':'public_home'};
    } else if(step.kind==='capture') {
      const ok=status===401;result={status,denied:ok,ok,code:ok?'ok':'public_capture_auth'};
    } else result=assessProtectedResponse({route:step.route,status,headers:response.headers,body});
    if(!record(step.check,result))break;
  }
  return finish();
}

module.exports={assessProtectedResponse,runPublicVerification};
if(require.main===module) {
  runPublicVerification({expectedSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,onCheck:check=>console.log(JSON.stringify(check))})
    .then(result=>{console.log(JSON.stringify({verification:'public',ok:result.ok,code:result.code}));process.exitCode=result.ok?0:1;})
    .catch(()=>{console.error(JSON.stringify({verification:'public',ok:false,code:'verification_error'}));process.exitCode=1;});
}
