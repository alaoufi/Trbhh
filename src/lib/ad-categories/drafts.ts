import {fieldApplies,type CategoryField,type CategoryFieldContext,type CategoryValue,type CategoryValues,type CategoryRange} from './validation';
const blank=(v:unknown)=>v===undefined||v===null||(typeof v==='string'&&!v.trim())||(Array.isArray(v)&&!v.length);
function emptyDraft(value:CategoryValue){
  return blank(value)||(typeof value==='object'&&!Array.isArray(value)&&blank(value.min)&&blank(value.max));
}
export function setCategoryDraftValue(values:CategoryValues,key:string,value:CategoryValue):CategoryValues{
  const next={...values};if(emptyDraft(value))delete next[key];else next[key]=value;return next;
}
export function rangeDraftValue(value:CategoryValue|undefined,side:'min'|'max',input:string):CategoryRange{
  const old:CategoryRange=value&&typeof value==='object'&&!Array.isArray(value)?value:{min:'',max:''};
  return {min:old.min??'',max:old.max??'',[side]:input.trim()===''?'':Number(input)};
}
/** Filter inactive/empty keys, but preserve invalid active drafts for a truthful field error. */
export function categoryDraftValues(fields:CategoryField[],values:CategoryValues,context:CategoryFieldContext={}):CategoryValues{
  return Object.fromEntries(fields.filter(f=>fieldApplies(f,{...context,values})&&Object.hasOwn(values,f.key)&&!emptyDraft(values[f.key])).map(f=>[f.key,values[f.key]]));
}
