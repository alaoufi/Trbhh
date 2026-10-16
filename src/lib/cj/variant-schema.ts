/** Product option dimension names as declared by CJ productKeyEn; no type inference. */
export function readCjOptionSchema(raw:unknown):string[]{
 let value=raw;
 if(typeof value==='string'){const s=value.trim();if(!s||s.length>4000)return [];if(s.startsWith('[')){try{value=JSON.parse(s);}catch{return [];}}else value=s.split('-');}
 if(!Array.isArray(value)||!value.length||value.length>30||value.some(v=>typeof v!=='string'||!v.trim()||v.length>80))return [];
 const names=value.map(v=>v.trim());return new Set(names.map(v=>v.toLowerCase())).size===names.length?names:[];
}
