import type {CategoryField} from './validation';
export const CATEGORY_EDITOR_SECTIONS={fields:'إضافة وتعديل الحقول',requirements:'إجباري / اختياري',display:'ظهور الحقول واستخدامها'} as const;
export type CategoryEditorSection=keyof typeof CATEGORY_EDITOR_SECTIONS;
export function isCategoryEditorSection(value:unknown):value is CategoryEditorSection {return typeof value==='string'&&Object.hasOwn(CATEGORY_EDITOR_SECTIONS,value);}
export function categoryEditorPath(id:number,section:CategoryEditorSection){return `/admin/categories/subcategories/${id}/${section}`;}
export type FieldRequirement='required'|'optional'|'conditional';
export function fieldRequirement(field:CategoryField):FieldRequirement {return field.required?'required':field.dependsOn&&field.conditionEffect==='require'?'conditional':'optional';}
export function changeFieldRequirement(field:CategoryField,value:FieldRequirement):CategoryField {
  const next={...field,required:value==='required'};
  if(value!=='conditional'&&next.conditionEffect==='require'){
    delete next.dependsOn;delete next.dependencyOperator;delete next.dependencyValue;delete next.conditionEffect;
  }
  return next;
}
