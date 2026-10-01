import {createRequire} from 'node:module';
import {describe,expect,it,vi} from 'vitest';
const require=createRequire(import.meta.url);
const crawler=require('../../scripts/release/crawl-public-preview.cjs');

describe('anonymous public preview crawler',()=>{
  it('discovers same-origin GET links, excludes unsafe/non-public targets, and reports exact status buckets',async()=>{
    const pages:Record<string,{status:number;body?:string;location?:string}>={
      '/':{status:200,body:'<a href="/ok">ok</a><a href="/redirect">r</a><a href="/missing">m</a><a href="/server">s</a><a href="/logout">logout</a><a href="https://outside.example/x">x</a>'},
      '/ok':{status:200,body:'<a href="/nested#part">nested</a>'},'/nested':{status:200},
      '/redirect':{status:302,location:'/ok'},'/missing':{status:404},'/server':{status:500},
    };
    const fetchImpl=vi.fn(async(input:string)=>{const url=new URL(input),page=pages[url.pathname];return new Response(page?.body||'',{status:page?.status||404,headers:{'content-type':'text/html; charset=utf-8',...(page?.location?{location:page.location}:{})}});});
    const report=await crawler.crawlPublic('https://preview.example/',{fetchImpl,concurrency:2,maxUrls:50});
    expect(report).toMatchObject({TOTAL_DISCOVERED:6,status:{'2xx':3,'3xx':1,'4xx':1,'5xx':1},errors:{'404':['https://preview.example/missing'],'500':['https://preview.example/server']}});
    expect(fetchImpl.mock.calls.some(([url])=>String(url).includes('/logout'))).toBe(false);
  });
});
