'use client';
import {useRef,useState} from 'react';
import type {SubcategoryOption} from '@/lib/ad-categories/contracts';
import {groupCategoryFields,type FieldChange} from '@/lib/ad-categories/shared-fields';

export function CategorySharedFieldsEditor({subs,categoryId,subcategoryId,action}:{subs:SubcategoryOption[];categoryId:number;subcategoryId?:number;action:(fd:FormData)=>Promise<SubcategoryOption[]>}) {
  const [current,setCurrent]=useState(subs);
  const [saving,setSaving]=useState<string|null>(null);
  const [saved,setSaved]=useState<string|null>(null);
  const [failed,setFailed]=useState<string|null>(null);
  const busy=useRef(false);
  const groups=groupCategoryFields(subcategoryId?current.filter(s=>s.id===subcategoryId):current);
  async function save(change:FieldChange){
    if(busy.current)return;
    busy.current=true;setSaving(change.id);setSaved(null);setFailed(null);
    const fd=new FormData();fd.set('category_id',String(categoryId));
    if(subcategoryId)fd.set('subcategory_id',String(subcategoryId));
    fd.set('versions_json',JSON.stringify(current.map(s=>({id:s.id,version:s.version}))));
    fd.set('changes_json',JSON.stringify([change]));
    try{setCurrent(await action(fd));setSaved(change.id);}
    catch{setFailed(change.id);}
    finally{busy.current=false;setSaving(null);}
  }
  return <div className="space-y-2 rounded-xl border p-3" aria-busy={saving!==null}>
    <p className="rounded-lg bg-slate-50 p-2 text-sm">التعديل يُحفظ تلقائياً. إخفاء الحقل يجعله اختيارياً؛ إظهاره لا يجعله إجبارياً. التغيير يشمل الأقسام المذكورة تحت الحقل فقط.</p>
    {groups.map(g=><div key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2">
      <div className="min-w-0 flex-1"><b>{g.field.label}</b><span className="mr-2 text-xs text-muted-foreground">{g.field.key}</span>
        {!subcategoryId&&<p className="text-xs text-muted-foreground">{g.subcategoryIds.map(id=>current.find(s=>s.id===id)?.name).join('، ')}</p>}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs">الظهور<select aria-label={`ظهور ${g.field.label} ${g.field.key}`} disabled={saving!==null||failed!==null} className="mr-1 min-h-11 rounded-lg border p-1 text-sm" value={String(g.visible)} onChange={e=>void save({id:g.id,visible:e.target.value==='true'})}>
          {g.visible==='mixed'&&<option value="mixed" disabled>مختلف بين الأقسام</option>}<option value="true">ظاهر</option><option value="false">مخفي</option>
        </select></label>
        <label className="text-xs">الإلزام<select aria-label={`إلزام ${g.field.label} ${g.field.key}`} disabled={saving!==null||failed!==null||g.visible!==true} className="mr-1 min-h-11 rounded-lg border p-1 text-sm" value={String(g.required)} onChange={e=>void save({id:g.id,required:e.target.value==='true'})}>
          {g.required==='mixed'&&<option value="mixed" disabled>مختلف بين الأقسام</option>}<option value="true">إجباري</option><option value="false">اختياري</option>
        </select></label>
      </div>
      <span role="status" className="text-xs text-emerald-700">{saving===g.id?'جارٍ الحفظ…':saved===g.id?'تم الحفظ ✓':''}</span>
      {failed===g.id&&<p role="alert" className="w-full text-sm text-red-700">تعذّر تأكيد الحفظ. أعد تحميل الصفحة للتحقق من الحالة الحالية قبل التعديل مجدداً. <button type="button" className="underline" onClick={()=>window.location.reload()}>إعادة تحميل</button></p>}
    </div>)}
    {!groups.length&&<p>لا توجد حقول في هذا القسم بعد. أضفها من محرر القسم الفرعي.</p>}
  </div>;
}
