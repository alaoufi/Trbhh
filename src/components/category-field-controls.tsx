'use client';
import type {CategoryField} from '@/lib/ad-categories/validation';
import {changeFieldRequirement,fieldRequirement,type FieldRequirement} from '@/lib/ad-categories/admin-presentation';
export function FieldRequirementControl({field,onChange}:{field:CategoryField;onChange:(field:CategoryField)=>void}){
  const value=fieldRequirement(field);
  return <div className={`space-y-2 rounded-lg border p-3 ${value==='optional'?'border-emerald-200 bg-emerald-50/60':'border-red-200 bg-red-50/60'}`}>
    <label className="block font-medium">تعبئة الحقل: {field.label}<select className="mt-1 w-full rounded-lg border bg-white p-2 text-sm" value={value} onChange={e=>onChange(changeFieldRequirement(field,e.target.value as FieldRequirement))}>
      <option value="required">إجباري — يجب تعبئته</option><option value="optional">اختياري — يمكن تركه فارغًا</option>
      {field.dependsOn&&field.conditionEffect==='require'&&<option value="conditional">إجباري عند تحقق الشرط فقط</option>}
    </select></label>
    {!field.visible&&<p className="text-sm">هذا الحقل مخفي من النموذج حاليًا؛ لا يُطلب من العضو حتى تُفعّل ظهوره.</p>}
    {field.dependsOn&&<p className="text-sm">{field.conditionEffect==='require'?'له شرط إلزام محفوظ. اختيار إجباري أو اختياري يلغي شرط الإلزام فقط.':'له شرط ظهور محفوظ؛ الإلزام يطبّق عندما يظهر الحقل فقط.'} تعديل الشرط من صفحة إضافة وتعديل الحقول.</p>}
  </div>;
}
const displayOptions=[
  ['visible','إظهار الحقل في نموذج إضافة وتعديل الإعلان','عند الإيقاف لا يظهر للعضو ولا يُطلب منه إدخاله.'],
  ['searchable','استخدام القيمة في البحث النصي','السماح بالبحث عن الإعلانات باستخدام قيمة هذا الحقل.'],
  ['filterable','إتاحة الحقل ضمن فلاتر البحث','يستطيع الزائر تضييق النتائج حسب هذا الحقل.'],
  ['comparable','عرض الحقل عند مقارنة الإعلانات','يظهر ضمن المواصفات عند استخدام المقارنة.'],
  ['showInCard','عرض القيمة في بطاقة الإعلان المختصرة','إظهار المعلومة في بطاقة الإعلان ضمن القوائم.'],
  ['showInDetails','عرض القيمة في صفحة تفاصيل الإعلان','إظهار القيمة المسجلة داخل صفحة الإعلان.'],
] as const;
export function FieldDisplayControls({field,onChange}:{field:CategoryField;onChange:(patch:Partial<CategoryField>)=>void}){
  return <div className="grid gap-3 sm:grid-cols-2">{displayOptions.map(([key,label,hint])=><label key={key} className="flex items-start gap-2 rounded-lg border bg-white p-3 text-sm"><input type="checkbox" className="mt-1" checked={key==='showInDetails'?field[key]!==false:field[key]===true} onChange={e=>onChange({[key]:e.target.checked})}/><span>{label}<small className="mt-1 block text-muted-foreground">{hint}</small></span></label>)}</div>;
}
