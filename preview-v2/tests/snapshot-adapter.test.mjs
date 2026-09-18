import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const url=new URL('../lib/snapshot.ts',import.meta.url);
const api=existsSync(url)?await import(url.href):{};
export const fixture=()=>({schemaVersion:1,mode:'live',source:'https://trbhh.sa',capturedAt:'2026-09-19T10:00:00.000Z',sourceCommit:'a'.repeat(40),count:1,complete:true,listings:[{id:'9001',title:'عنوان أصلي',description:'وصف أصلي',price:10,priceType:null,rentPeriod:null,city:'الرياض',seller:'اسم عام',verified:false,condition:'',specs:[],category:'',subcategory:'',classificationRevision:'b'.repeat(64),sourceUrl:'https://trbhh.sa/ads/9001',time:'2026-09-19',images:['https://trbhh.sa/media/a.jpg'],image:'https://trbhh.sa/media/a.jpg',intent:'wanted',sourceCategoryId:'1',sourceSubcategoryId:null}]});
test('live adapter preserves exact public records and never falls back to demo',()=>{
 assert.equal(typeof api.validateSnapshot,'function');
 const value=fixture();assert.deepEqual(api.validateSnapshot(value),value);
 assert.deepEqual(api.marketListings(value,[{id:'demo'}]),value.listings);
 assert.deepEqual(api.marketListings({...value,count:0,listings:[]},[{id:'demo'}]),[]);
 assert.deepEqual(api.marketListings({mode:'demo',listings:[]},[{id:'demo'}]),[{id:'demo'}]);
});
test('strict allowlist rejects private keys, duplicates and malformed metadata',()=>{
 assert.equal(typeof api.validateSnapshot,'function');
 for(const change of [s=>s.secret='private',s=>s.listings[0].phone='private',s=>s.listings.push(s.listings[0]),s=>s.count=2,s=>s.complete=false,s=>s.capturedAt='yesterday',s=>s.capturedAt='2026-02-30T00:00:00.000Z',s=>s.sourceCommit='bad',s=>s.listings[0].classificationRevision='bad',s=>s.listings[0].condition='مستعمل',s=>s.listings[0].specs=[['fake','value']]]){const s=fixture();change(s);assert.throws(()=>api.validateSnapshot(s));}
});
test('rejects foreign URLs, credentials, query secrets and mismatched source IDs',()=>{
 assert.equal(typeof api.validateSnapshot,'function');
 for(const change of [s=>s.source='https://evil.test',s=>s.listings[0].sourceUrl='https://trbhh.sa/ads/2',s=>s.listings[0].images=['https://evil.test/a.jpg'],s=>s.listings[0].images=['https://user:pass@trbhh.sa/media/a.jpg'],s=>s.listings[0].images=['https://trbhh.sa/media/a.jpg?token=secret'],s=>s.listings[0].image='https://evil.test/a.jpg']){const s=fixture();change(s);assert.throws(()=>api.validateSnapshot(s));}
});
test('review export includes only current explicit market assignments with source metadata',()=>{
 assert.equal(typeof api.reviewExport,'function');const s=fixture();const ad=s.listings[0];
 const current={category:'أخرى',subcategory:'كتب',fromCategory:'',fromSubcategory:'',fromRevision:ad.classificationRevision,updatedAt:1};
 const result=api.reviewExport(s,{'market:9001':current,'local:1':current});
 assert.equal(result.assignments.length,1);assert.equal(result.assignments[0].id,ad.id);assert.equal(result.assignments[0].classificationRevision,ad.classificationRevision);assert.equal(result.sourceCommit,s.sourceCommit);assert.equal(result.assignments[0].destinationSubcategory,'كتب');
 assert.equal(api.reviewExport(s,{'market:9001':{...current,fromRevision:'stale'}}).assignments.length,0);
});
test('matches exporter host/path/ID/commit/count bounds and keeps missing photos empty',()=>{
 for(const host of ['trbhh.sa','trbhh.com','www.trbhh.sa','www.trbhh.com']){const s=fixture();s.listings[0].images=[`https://${host}/media/uploads/a.jpg`];s.listings[0].image=s.listings[0].images[0];assert.deepEqual(api.validateSnapshot(s),s);}
 const legacy=fixture();legacy.listings[0].sourceCategoryId='0';legacy.listings[0].sourceSubcategoryId='0';assert.deepEqual(api.validateSnapshot(legacy),legacy);
 const empty=fixture();empty.listings[0].images=[];empty.listings[0].image='/placeholder-ad.svg';assert.equal(api.validateSnapshot(empty).listings[0].images.length,0);
 for(const change of [s=>s.sourceCommit='a'.repeat(39),s=>s.listings[0].sourceCategoryId='-1',s=>s.listings[0].sourceSubcategoryId='-1',s=>s.listings[0].id='../1',s=>{s.listings[0].images=['https://trbhh.sa/media/a/../b.jpg'];s.listings[0].image=s.listings[0].images[0];},s=>s.listings[0].images=['https://trbhh.sa/uploads/a.jpg'],s=>s.listings[0].images=['https://trbhh.sa:443/media/a.jpg'],s=>{s.listings=Array.from({length:10001},()=>s.listings[0]);s.count=10001;}]){const s=fixture();change(s);assert.throws(()=>api.validateSnapshot(s));}
});
