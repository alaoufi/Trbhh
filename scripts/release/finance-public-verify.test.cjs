'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {assessProtectedResponse,runPublicVerification}=require('./finance-public-verify.cjs');

const sha='a'.repeat(40),origin='https://trbhh.sa';
const headers={'content-type':'text/html; charset=utf-8','cache-control':'private, no-cache, no-store, max-age=0, must-revalidate'};
const stream=(target='/login',digestTarget=target)=>`<!doctype html><html><head><meta id="__next-page-redirect" http-equiv="refresh" content="1;url=${target}"/></head><body><script>self.__next_f.push([1,"3:E{\\"digest\\":\\"NEXT_REDIRECT;replace;${digestTarget};307;\\"}\\n"])</script></body></html>`;
const assess=(overrides={})=>assessProtectedResponse({route:'/admin/finance',status:200,headers,body:stream(),...overrides});
const response=(body='',status=200,extraHeaders={})=>new Response(body,{status,headers:extraHeaders});
const healthyResponses=()=>[
  response(JSON.stringify({commit:sha}),200,{'cache-control':'no-store'}),
  response('<!doctype html>'+ 'public home '.repeat(20)),
  response(stream(),200,headers),
  response(stream(),200,headers),
  response('',307,{location:'/login'}),
  response('',401),
];
async function run(responses=healthyResponses(),options={}) {
  const calls=[],reports=[];
  const result=await runPublicVerification({expectedSha:sha,runId:'12345',now:new Date('2026-09-24T00:00:00Z'),fetchImpl:async(url,init)=>{
    calls.push({url,init});const next=responses.shift();if(next instanceof Error)throw next;return next;
  },onCheck:report=>reports.push(report),...options});
  return {result,calls,reports};
}

test('all protected routes accept explicit denial or a same-origin login HTTP redirect',()=>{
  for(const route of ['/admin/finance','/admin/access-control','/admin/finance/export?format=print','/api/finance/private']){
    for(const status of [401,403])assert.equal(assess({route,status,headers:{},body:''}).ok,true);
    for(const status of [301,302,303,307,308])for(const location of ['/login','/account/login',origin+'/login?returnTo=%2Fadmin%2Ffinance']){
      assert.equal(assess({route,status,headers:{location},body:''}).ok,true);
    }
  }
});
test('HTTP redirect targets must be a trusted login and never leak their query',()=>{
  for(const location of ['', '//evil.invalid/login?secret=SENTINEL', 'https://evil.invalid/login','http://trbhh.sa/login','/admin/finance','https://user:password@trbhh.sa/login','/login#secret','javascript:alert(1)']){
    const result=assess({status:307,headers:{location}});assert.equal(result.ok,false);assert.equal(result.code,'protected_redirect');
    assert.doesNotMatch(JSON.stringify(result),/SENTINEL|password|evil\.invalid|javascript/);
  }
});
test('only the two exact admin HTML paths accept the known Next.js streaming login',()=>{
  for(const route of ['/admin/finance','/admin/access-control']){
    const result=assess({route});assert.equal(result.ok,true);assert.equal(result.streamingRedirect,true);assert.equal(result.digestMatches,true);
  }
  for(const route of ['/api/finance/private','/admin/finance/export?format=print','/admin/finance/','/admin/finance?anything=true','/admin/access-control/other']){
    const result=assess({route,allowStreaming:true});assert.equal(result.ok,false);assert.equal(result.code,'protected_status');
  }
});
test('a private 200 page alone never proves an authentication redirect',()=>{
  const result=assess({body:'<!doctype html><p>Private customer invoice SENTINEL</p>'});assert.equal(result.ok,false);assert.equal(result.code,'protected_stream_redirect');
  assert.doesNotMatch(JSON.stringify(result),/SENTINEL|customer invoice/);
});
test('admin layout markers reject even an otherwise complete streaming redirect',()=>{
  for(const marker of ['<main id="admin-content">private</main>',"<nav id='admin-nav'>private</nav>",'<main id=admin-content>private</main>','<nav ID = "admin-nav">private</nav>','<script>{"id":"admin-content"}</script>','<script>{\\"id\\":\\"admin-nav\\"}</script>']){
    const result=assess({body:stream()+marker});assert.equal(result.ok,false);assert.equal(result.code,'protected_admin_content');assert.equal(result.adminLayoutAbsent,false);
  }
});
test('streaming redirect requires HTML plus private and no-store cache directives',()=>{
  for(const changed of [{'content-type':'application/json'},{'cache-control':'private'},{'cache-control':'no-store'},{'cache-control':'private, x-no-store'},{'cache-control':'public, no-store'}]){
    const result=assess({headers:{...headers,...changed}});assert.equal(result.ok,false);assert.equal(result.code,'protected_stream_headers');
  }
});
test('meta and digest must each name the same trusted login',()=>{
  for(const body of [stream('https://evil.invalid/login'),stream('/login','https://evil.invalid/login'),stream('/login','/account/login'),stream('/login?token=one','/login?token=two'),stream().replace('http-equiv="refresh"','http-equiv="other"'),stream().replace('__next-page-redirect','unrelated'),stream()+ '<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=https://evil.invalid/login"/>']){
    assert.equal(assess({body}).ok,false);
  }
});
test('missing or malformed Next.js digest and refresh are rejected',()=>{
  for(const body of [stream().replace('NEXT_REDIRECT','OTHER'),stream().replace(';307;',';200;'),stream().replace(';replace;',';unknown;'),stream().replace('1;url=','0;url='),stream().replace('<script>','<!--<script>').replace('</script>','</script>-->')]){
    assert.equal(assess({body}).ok,false);
  }
});
test('fake meta tags inside comments, scripts, templates, or escaped text are rejected',()=>{
  const meta='<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/login"/>';
  for(const replacement of [`<!--${meta}-->`,`<script>${JSON.stringify(meta)}</script>`,`<template>${meta}</template>`,meta.replaceAll('<','&lt;').replaceAll('>','&gt;')]){
    assert.equal(assess({body:stream().replace(meta,replacement)}).ok,false);
  }
});
test('fetch runner retains exact SHA, home, protected export, and capture gates without credentials',async()=>{
  const {result,calls,reports}=await run();assert.equal(result.ok,true);assert.equal(reports.length,6);assert.equal(calls.length,6);
  assert.deepEqual(reports.map(r=>r.check),['revision','home','finance_page','access_page','finance_export','capture_auth']);
  assert.equal(calls[0].url,origin+'/api/version?verification=12345');
  assert.equal(calls[4].url,origin+'/admin/finance/export?format=print&section=tax&month=2026-09');
  assert.equal(calls[5].init.method,'POST');
  for(const {url,init} of calls){assert.equal(new URL(url).origin,origin);assert.equal(init.redirect,'manual');assert.equal(init.cache,'no-store');assert.equal(init.credentials,'omit');assert(init.signal instanceof AbortSignal);assert.deepEqual(init.headers,{'Cache-Control':'no-cache, no-store'});}
});
test('wrong revision, status, malformed JSON or missing no-store fails before any other gate',async()=>{
  for(const wrong of [response(JSON.stringify({commit:'b'.repeat(40)}),200,{'cache-control':'no-store'}),response('{private SENTINEL}',200,{'cache-control':'no-store'}),response(JSON.stringify({commit:sha})),response('',503)]){
    const {result,calls,reports}=await run([wrong]);assert.equal(result.ok,false);assert.equal(result.code,'public_revision');assert.equal(calls.length,1);assert.doesNotMatch(JSON.stringify(reports),/SENTINEL|aaaa|bbbb/);
  }
});
test('home status and minimum body gate remain required',async()=>{
  for(const wrong of [response('short'),response('x'.repeat(101),503)]){
    const responses=healthyResponses();responses[1]=wrong;const {result,calls}=await run(responses);assert.equal(result.code,'public_home');assert.equal(calls.length,2);
  }
});
test('export 200 cannot borrow the HTML redirect exception',async()=>{
  const responses=healthyResponses();responses[4]=response(stream(),200,headers);
  const {result,calls}=await run(responses);assert.equal(result.ok,false);assert.equal(result.code,'protected_status');assert.equal(calls.length,5);
});
test('capture requires 401 specifically, including when redirect or forbidden looks protected',async()=>{
  for(const status of [200,403,307,500]){
    const responses=healthyResponses();responses[5]=response('SENTINEL',status,{location:'/login?secret=SENTINEL'});
    const {result,reports}=await run(responses);assert.equal(result.ok,false);assert.equal(result.code,'public_capture_auth');assert.equal(reports.at(-1).status,status);assert.doesNotMatch(JSON.stringify(reports),/SENTINEL/);
  }
});
test('network and body-read errors expose only fixed check names and error codes',async()=>{
  for(let index=0;index<6;index++){
    const responses=healthyResponses();responses[index]=new Error('https://private.invalid/?token=SENTINEL');
    const {result,reports}=await run(responses);assert.equal(result.ok,false);assert.equal(result.code,'network_error');assert.equal(reports.at(-1).status,null);assert.doesNotMatch(JSON.stringify({result,reports}),/SENTINEL|private\.invalid|token=/);
  }
  const responses=healthyResponses();responses[2]={status:200,headers:new Headers(headers),text:async()=>{throw new Error('SENTINEL');}};
  const {result,reports}=await run(responses);assert.equal(result.code,'response_read_error');assert.equal(reports.at(-1).status,200);assert.doesNotMatch(JSON.stringify({result,reports}),/SENTINEL/);
});
test('invalid candidate and run identifiers fail closed before fetching; CLI redacts invalid input',async()=>{
  for(const options of [{expectedSha:'invalid SENTINEL'},{runId:'../SENTINEL'},{runId:''}]){
    const {result,calls}=await run([],options);assert.equal(result.code,'invalid_configuration');assert.equal(calls.length,0);
  }
  const result=spawnSync(process.execPath,[path.join(__dirname,'finance-public-verify.cjs')],{encoding:'utf8',env:{...process.env,GITHUB_SHA:'SENTINEL',GITHUB_RUN_ID:'12345'}});
  assert.equal(result.status,1);assert.match(result.stdout,/invalid_configuration/);assert.doesNotMatch(result.stdout+result.stderr,/SENTINEL/);
});
