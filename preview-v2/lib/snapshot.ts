import {validTarget} from './classification.ts';
export type Listing = {id:string;title:string;price:number;priceType?:string|null;rentPeriod?:string|null;city:string;category:string;subcategory?:string;condition:string;time:string;image:string;images:string[];seller:string;verified:boolean;featured?:boolean;description:string;specs:[string,string][];intent?:'offer'|'wanted';classificationRevision?:string;sourceUrl?:string;sourceCategoryId?:string;sourceSubcategoryId?:string|null};
export type LiveSnapshot={schemaVersion:1;mode:'live';source:string;capturedAt:string;sourceCommit:string;count:number;complete:true;listings:Listing[]};
export type Snapshot=LiveSnapshot|{mode:'demo';listings:Listing[]};
function check(ok:unknown):asserts ok {if(!ok)throw new Error('Invalid public snapshot: schema or public allowlist mismatch');}
function shape(value:unknown,keys:string[]):asserts value is Record<string,unknown>{check(value && typeof value==='object' && !Array.isArray(value));check(Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k)));}
export function isOriginalMedia(value:unknown):value is string {
 if(typeof value!=='string')return false;
 try{if(value.includes('\\')||decodeURIComponent(value).split('/').includes('..'))return false;const u=new URL(value);return u.protocol==='https:' && ['trbhh.sa','trbhh.com','www.trbhh.sa','www.trbhh.com'].includes(u.hostname) && !u.port && !/^https:\/\/[^/]+:\d+/i.test(value) && !u.username && !u.password && !u.search && !u.hash && /^\/media\/.+/.test(u.pathname) && !/%2e|%2f|%5c/i.test(value);}catch{return false;}
}
export function validateSnapshot(value:unknown):LiveSnapshot {
 shape(value,['schemaVersion','mode','source','capturedAt','sourceCommit','count','complete','listings']);
 check(value.schemaVersion===1 && value.mode==='live' && value.source==='https://trbhh.sa' && value.complete===true);
 check(typeof value.capturedAt==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value.capturedAt) && Number.isFinite(Date.parse(value.capturedAt)) && new Date(value.capturedAt).toISOString()===value.capturedAt.replace(/(?<!\.\d{3})Z$/,'.000Z'));
 check(typeof value.sourceCommit==='string' && /^[a-f0-9]{40}$/i.test(value.sourceCommit));
 check(Array.isArray(value.listings) && value.count===value.listings.length && value.listings.length<=10000);
 const ids=new Set<string>();
 for(const ad of value.listings){
  shape(ad,['id','title','description','price','priceType','rentPeriod','city','seller','verified','condition','specs','category','subcategory','classificationRevision','sourceUrl','time','images','image','intent','sourceCategoryId','sourceSubcategoryId']);
  for(const key of ['id','title','description','city','seller','time','sourceCategoryId'])check(typeof ad[key]==='string');
  check(typeof ad.id==='string' && /^[1-9][0-9]*$/.test(ad.id) && !ids.has(ad.id));ids.add(ad.id);
  check(ad.sourceUrl===`https://trbhh.sa/ads/${ad.id}` && typeof ad.classificationRevision==='string' && /^[a-f0-9]{64}$/i.test(ad.classificationRevision));
  check(typeof ad.price==='number' && Number.isFinite(ad.price) && ad.price>=0 && typeof ad.verified==='boolean');
  check(ad.condition==='' && ad.category==='' && ad.subcategory==='' && Array.isArray(ad.specs) && ad.specs.length===0);
  check((ad.priceType===null||typeof ad.priceType==='string')&&(ad.rentPeriod===null||typeof ad.rentPeriod==='string'));
  check(ad.intent==='offer'||ad.intent==='wanted');check(typeof ad.sourceCategoryId==='string' && /^[0-9]+$/.test(ad.sourceCategoryId));check(ad.sourceSubcategoryId===null||typeof ad.sourceSubcategoryId==='string' && /^[0-9]+$/.test(ad.sourceSubcategoryId));
  check(ad.time==='' || typeof ad.time==='string' && /^\d{4}-\d\d-\d\d$/.test(ad.time) && new Date(ad.time).toISOString().slice(0,10)===ad.time);
  check(Array.isArray(ad.images) && ad.images.every(isOriginalMedia));check(ad.image===(ad.images[0]||'/placeholder-ad.svg'));
 }
 return value as LiveSnapshot;
}
export function marketListings(snapshot:Snapshot,demo:Listing[]):Listing[]{return snapshot.mode==='live'?snapshot.listings:demo;}
type Review={category:string;subcategory:string;fromCategory?:string;fromSubcategory?:string;fromRevision?:string;updatedAt?:number};
export function reviewExport(snapshot:Snapshot,assignments:Record<string,Review>){
 if(snapshot.mode!=='live')throw new Error('A live snapshot is required');
 return {schemaVersion:1,source:snapshot.source,capturedAt:snapshot.capturedAt,sourceCommit:snapshot.sourceCommit,count:snapshot.count,exportedAt:new Date().toISOString(),assignments:snapshot.listings.flatMap(ad=>{
  const a=assignments['market:'+ad.id];
  return validTarget(a)&&a.fromRevision===ad.classificationRevision&&a.fromCategory===ad.category&&a.fromSubcategory===ad.subcategory?[{id:ad.id,classificationRevision:ad.classificationRevision,sourceCategoryId:ad.sourceCategoryId,sourceSubcategoryId:ad.sourceSubcategoryId,destinationCategory:a.category,destinationSubcategory:a.subcategory,reviewedAt:a.updatedAt}]:[];
 })};
}
