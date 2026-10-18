'use strict';
function loginTarget(value,origin){
 try{const base=new URL(origin),url=new URL(value,base);return url.origin===base.origin&&url.pathname==='/login';}catch{return false;}
}
function isLoginRedirect({status,location='',body=''},origin){
 if([301,302,303,307,308].includes(status))return loginTarget(location,origin);
 if(status!==200)return false;
 const metaTags=body.match(/<meta\b[^>]*>/gi)||[];
 const meta=metaTags.find(tag=>/\bid=["']__next-page-redirect["']/i.test(tag)&&/\bhttp-equiv=["']refresh["']/i.test(tag));
 const target=meta?.match(/\bcontent=["']\d+;\s*url=([^"']+)["']/i)?.[1];
 if(!target||!loginTarget(target,origin))return false;
 const templates=body.match(/<template\b[^>]*>/gi)||[];
 return templates.some(tag=>{const digest=tag.match(/\bdata-dgst=["']NEXT_REDIRECT;(?:replace|push);([^;]+);30[1378];["']/)?.[1];return !!digest&&loginTarget(digest,origin);});
}
async function probe(origin,expected){
 if(!/^[a-f0-9]{40}$/.test(expected))throw Error('EXPECTED_COMMIT_REQUIRED');
 const base=new URL(origin);if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('ORIGIN_INVALID');
 const version=await fetch(base.origin+'/api/version?verify='+expected,{cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(!version.ok||(await version.json()).commit!==expected)throw Error('PUBLIC_VERSION_MISMATCH');
 console.log('PUBLIC_VERSION_VERIFIED');
 for(const path of ['/notifications','/notifications?tab=archive','/admin/finance?section=tax']){
  const response=await fetch(base.origin+path,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(30000)});
  const body=response.status===200?await response.text():'';
  if(!isLoginRedirect({status:response.status,location:response.headers.get('location')||'',body},base.origin))throw Error('AUTH_ROUTE_CHECK_FAILED: '+path);
  console.log('LOGIN_REDIRECT_VERIFIED '+path+' HTTP='+response.status);
 }
 console.log('NO_AUTHENTICATED_FINANCIAL_ACTION_EXECUTED');
 console.log('AUTHENTICATED_UI_REVIEW_REQUIRED_SEPARATELY');
}
module.exports={isLoginRedirect,probe};
if(require.main===module)probe(process.argv[2]||'',process.argv[3]||'').catch(error=>{console.error(error.message);process.exitCode=1;});
