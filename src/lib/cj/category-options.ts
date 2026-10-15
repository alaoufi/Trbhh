import type {CjCategory} from './types';
/** Deduplicate source ids, not translated names: different branches remain selectable. */
export function cjCategoryOptions(categories:CjCategory[],labels:Map<string,string>,translations:Map<string,string>=new Map()){
 const unique=Array.from(new Map(categories.map(c=>[c.id,c])).values());
 const base=(c:CjCategory)=>labels.get(c.id)||c.path||c.name;
 const normalize=(s:string)=>s.trim().replace(/\s+/g,' ').toLowerCase();
 const counts=new Map<string,number>();for(const c of unique){const key=normalize(base(c));counts.set(key,(counts.get(key)||0)+1);}
 const used=new Map<string,number>();
 return unique.map(c=>{let label=base(c);if((counts.get(normalize(label))||0)>1)label+=` — ${c.path}`;const key=normalize(label),number=(used.get(key)||0)+1;used.set(key,number);if(number>1)label+=` (فرع ${number})`;const parts=c.levels?.length?c.levels:c.path.split(/\s*[›>]\s*/).map(p=>p.trim()).filter(Boolean);return {id:c.id,label,levels:parts.map(key=>({key,label:translations.get(key)||key}))};});
}
