#!/usr/bin/env node
'use strict';

const EXCLUDED_PATHS=[/^\/(?:api|_next|admin|account)(?:\/|$)/,/^\/(?:logout|ads\/new)(?:\/|$)/];
const ASSET_EXT=/\.(?:avif|bmp|css|csv|gif|ico|jpe?g|js|json|map|mp3|mp4|pdf|png|svg|txt|webm|webp|woff2?|xml|zip)$/i;

function publicUrl(raw,base,origin){
  try{
    const url=new URL(raw,base);
    if(url.origin!==origin||!['http:','https:'].includes(url.protocol))return null;
    url.hash='';
    for(const key of [...url.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid)$/i.test(key))url.searchParams.delete(key);
    if(EXCLUDED_PATHS.some(pattern=>pattern.test(url.pathname))||ASSET_EXT.test(url.pathname))return null;
    return url.href;
  }catch{return null;}
}

function linksFromHtml(html,base,origin){
  const links=[];const pattern=/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;let match;
  while((match=pattern.exec(html))){
    const raw=(match[1]||match[2]||match[3]||'').replace(/&amp;/g,'&');
    const url=publicUrl(raw,base,origin);if(url)links.push(url);
  }
  return [...new Set(links)];
}

async function crawlPublic(start,{fetchImpl=fetch,concurrency=8,maxUrls=3000}={}){
  const initial=new URL(start);initial.hash='';const origin=initial.origin;
  const queue=[initial.href],seen=new Set(),results=[];
  while(queue.length&&seen.size<maxUrls){
    const batch=[];
    while(queue.length&&batch.length<concurrency&&seen.size+batch.length<maxUrls){const url=queue.shift();if(!url||seen.has(url)||batch.includes(url))continue;batch.push(url);}
    for(const url of batch)seen.add(url);
    const completed=await Promise.all(batch.map(async url=>{
      try{
        const response=await fetchImpl(url,{method:'GET',redirect:'manual',headers:{cookie:'',authorization:'','user-agent':'Trbhh-Preview-Public-Crawler/1.0'},signal:AbortSignal.timeout(30000)});
        const status=response.status,contentType=response.headers.get('content-type')||'';
        const body=status>=200&&status<300&&contentType.includes('text/html')?await response.text():'';
        const discovered=body?linksFromHtml(body,url,origin):[];
        const location=status>=300&&status<400?publicUrl(response.headers.get('location')||'',url,origin):null;
        if(location)discovered.push(location);
        return {url,status,discovered};
      }catch(error){return {url,status:0,discovered:[],error:error instanceof Error?error.message:String(error)};}
    }));
    for(const result of completed){results.push(result);for(const url of result.discovered)if(!seen.has(url)&&!queue.includes(url))queue.push(url);}
  }
  const status={'2xx':0,'3xx':0,'4xx':0,'5xx':0,network:0},errors={'404':[],'500':[]};
  for(const result of results){
    if(result.status>=200&&result.status<300)status['2xx']++;
    else if(result.status>=300&&result.status<400)status['3xx']++;
    else if(result.status>=400&&result.status<500)status['4xx']++;
    else if(result.status>=500)status['5xx']++;
    else status.network++;
    if(result.status===404)errors['404'].push(result.url);
    if(result.status===500)errors['500'].push(result.url);
  }
  return {origin,TOTAL_DISCOVERED:results.length,status,errors,truncated:queue.length>0,results:results.map(({url,status,error})=>({url,status,...(error?{error}:{})}))};
}

async function main(){
  const start=process.argv[2];if(!start)throw new Error('preview_origin_required');
  const report=await crawlPublic(start);process.stdout.write(`${JSON.stringify(report)}\n`);
  if(report.status.network||report.status['5xx']||report.errors['404'].length)process.exitCode=1;
}

if(require.main===module)main().catch(error=>{console.error(error?.message||String(error));process.exitCode=1;});
module.exports={crawlPublic,linksFromHtml,publicUrl};
