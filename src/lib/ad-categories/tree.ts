import type {CategoryOption,SubcategoryOption} from './contracts';
export type AdBucket={categoryId:number;subcategoryId:number|null;count:number};
export type TreeSub={id:number;name:string;active:boolean;ads:number;similar?:string};
export type TreeCategory={id:number;name:string;active:boolean;ads:number;directAds:number;children:TreeSub[];similar?:string};
export function normalizedCategoryName(name:string){return name.normalize('NFKC').replace(/[\u064B-\u065F\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function reviewFamily(name:string){
 const n=normalizedCategoryName(name);
 if(/وظائف|توظيف/.test(n))return 'توظيف';
 if(/مواشي/.test(n))return 'مواشي';
 if(/مواد بناء/.test(n))return 'مواد بناء';
 if(/مشاتل|زراعه|زراعة|مزارع/.test(n))return 'زراعة ومشاتل';
 if(/سيارات|نقليات|دراجات/.test(n))return 'سيارات ونقل';
 if(/الكترونيات/.test(n))return 'إلكترونيات';
 if(/ديكور|اثاث|المنزل والمطبخ|اوان/.test(n))return 'منزل وديكور';
 return n;
}
function groups(nodes:{id:number;name:string}[],family:boolean){
 const map=new Map<string,number[]>();
 for(const n of nodes){const key=family?reviewFamily(n.name):normalizedCategoryName(n.name);map.set(key,[...(map.get(key)||[]),n.id]);}
 return new Map([...map].filter(([,ids])=>ids.length>1).flatMap(([key,ids])=>ids.map(id=>[id,key] as const)));
}
/** Keep each review group at its first position; never merge or hide identities. */
function adjacentGroups<T extends {id:number}>(nodes:T[],similar:Map<number,string>):T[]{
 const grouped=new Map<string,T[]>();
 for(const node of nodes){const key=similar.get(node.id)??'id:'+node.id;grouped.set(key,[...(grouped.get(key)||[]),node]);}
 return [...grouped.values()].flat();
}
export function categoryTree(categories:CategoryOption[],subs:SubcategoryOption[],buckets:AdBucket[]):TreeCategory[]{
 const mainGroups=groups(categories,true),subGroups=groups(subs,false);
 return adjacentGroups(categories,mainGroups).map(c=>{const children=adjacentGroups(subs.filter(s=>s.categoryId===c.id),subGroups),ids=new Set(children.map(s=>s.id));
  return {id:c.id,name:c.name,active:c.active,similar:mainGroups.get(c.id),ads:buckets.filter(b=>b.categoryId===c.id||b.subcategoryId!==null&&ids.has(b.subcategoryId)).reduce((n,b)=>n+b.count,0),directAds:buckets.filter(b=>b.categoryId===c.id&&(b.subcategoryId===null||!ids.has(b.subcategoryId))).reduce((n,b)=>n+b.count,0),children:children.map(s=>({id:s.id,name:s.name,active:s.active,similar:subGroups.get(s.id),ads:buckets.filter(b=>b.subcategoryId===s.id).reduce((n,b)=>n+b.count,0)}))};
 });
}
export function categoryReviewColor(key:string){let hash=0;for(const c of key)hash=(hash*31+c.charCodeAt(0))>>>0;const hue=hash%360;return {backgroundColor:`hsl(${hue} 75% 95%)`,borderColor:`hsl(${hue} 55% 45%)`};}
