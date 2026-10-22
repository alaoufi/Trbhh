import type {SubcategoryOption} from './contracts';
import {CategoryValidationError, type CategoryField, validateDefinition} from './validation';

export type FieldChange = {id:string;visible?:boolean;required?:boolean};
export type FieldGroup = {id:string;field:CategoryField;subcategoryIds:number[];visible:boolean|'mixed';required:boolean|'mixed'};
/** Same label alone is not sufficient: incompatible options/types remain separate. */
function identity(f:CategoryField) {
  return JSON.stringify([f.key,f.label,f.type,f.options,f.min??null,f.max??null,f.unit??'']);
}
export function groupCategoryFields(subs:SubcategoryOption[]):FieldGroup[] {
  const groups=new Map<string,FieldGroup>();
  for(const sub of subs) for(const f of sub.fields) {
    const id=identity(f), prior=groups.get(id);
    if(!prior) groups.set(id,{id,field:f,subcategoryIds:[sub.id],visible:f.visible,required:f.required});
    else {prior.subcategoryIds.push(sub.id);if(prior.visible!==f.visible)prior.visible='mixed';if(prior.required!==f.required)prior.required='mixed';}
  }
  return [...groups.values()];
}
/** Patch only selected flags on matching existing fields; never copy/delete fields. */
export function planCategoryFieldChanges(subs:SubcategoryOption[], changes:FieldChange[]) {
  if(!Array.isArray(changes)||changes.length>1000)throw new CategoryValidationError('','تغييرات غير صالحة');
  const allowed=new Set(groupCategoryFields(subs).map(g=>g.id)), patches=new Map<string,FieldChange>();
  for(const p of changes) {
    if(!p||typeof p.id!=='string'||!allowed.has(p.id)||patches.has(p.id)
      ||Object.keys(p).some(k=>!['id','visible','required'].includes(k))
      ||(p.visible!==undefined&&typeof p.visible!=='boolean')||(p.required!==undefined&&typeof p.required!=='boolean')
      ||(p.visible===undefined&&p.required===undefined))throw new CategoryValidationError('','تغيّر الحقل أو الطلب غير صالح');
    patches.set(p.id,p);
  }
  return subs.flatMap(sub=>{
    let changed=false;
    const fields=sub.fields.map(f=>{
      const patch=patches.get(identity(f));if(!patch)return f;
      const visible=patch.visible??f.visible,required=visible?(patch.required??f.required):false;
      if(visible===f.visible&&required===f.required)return f;
      changed=true;return {...f,visible,required};
    });
    return changed?[{...sub,fields:validateDefinition(fields)}]:[];
  });
}
