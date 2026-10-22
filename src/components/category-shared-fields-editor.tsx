'use client';
import {useState} from 'react';
import type {SubcategoryOption} from '@/lib/ad-categories/contracts';
import {groupCategoryFields,type FieldChange} from '@/lib/ad-categories/shared-fields';

export function CategorySharedFieldsEditor({subs,categoryId,section,action,returnTo}:{subs:SubcategoryOption[];categoryId:number;section:'requirements'|'display';action:(fd:FormData)=>Promise<void>;returnTo:string}) {
  const [changes,setChanges]=useState<Record<string,FieldChange>>({});
  const groups=groupCategoryFields(subs), flag=section==='display'?'visible':'required';
  return <form action={action} className="space-y-3 rounded-xl border p-3">
    <input type="hidden" name="category_id" value={categoryId}/><input type="hidden" name="return_to" value={returnTo}/>
    <input type="hidden" name="versions_json" value={JSON.stringify(subs.map(s=>({id:s.id,version:s.version})))}/>
    <input type="hidden" name="changes_json" value={JSON.stringify(Object.values(changes))}/>
    <p className="rounded-lg bg-amber-50 p-3 text-sm">تُطبّق فقط الخيارات التي تغيّرها على الأقسام المذكورة تحت الحقل، بما فيها الأقسام المخفية. اترك «دون تغيير» للحفاظ على الاستثناءات. الحقل المخفي يبقى اختيارياً؛ أظهره أولاً إن أردت جعله إجبارياً.</p>
    {groups.map(g=><div key={g.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0"><b>{g.field.label}</b><span className="mr-2 text-xs text-muted-foreground">{g.field.key} · {g.field.type}</span>
        <p className="text-xs text-muted-foreground">{g.subcategoryIds.map(id=>subs.find(s=>s.id===id)?.name).join('، ')}</p>
        <p className="text-xs">الحالي: {g[flag]==='mixed'?'مختلف بين الأقسام':flag==='visible'?(g.visible?'ظاهر':'مخفي'):(g.required?'إجباري':'اختياري')}</p>
      </div>
      <label className="text-sm">{flag==='visible'?'الظهور':'الإلزام'}
        <select aria-label={`${flag==='visible'?'ظهور':'إلزام'} ${g.field.label} ${g.field.key}`} className="mr-2 min-h-11 rounded-lg border p-2" value={changes[g.id]?.[flag]===undefined?'keep':String(changes[g.id][flag])} onChange={e=>setChanges(prior=>{const next={...prior};if(e.target.value==='keep')delete next[g.id];else next[g.id]={id:g.id,[flag]:e.target.value==='true'};return next;})}>
          <option value="keep">دون تغيير</option><option value="false">{flag==='visible'?'مخفي':'اختياري'}</option><option value="true">{flag==='visible'?'ظاهر':'إجباري للحقول الظاهرة'}</option>
        </select>
      </label>
    </div>)}
    {!groups.length&&<p>لا توجد حقول في الأقسام الفرعية بعد. أضفها من محرر القسم الفرعي.</p>}
    <button disabled={!Object.keys(changes).length} className="min-h-11 rounded-lg bg-primary px-4 py-2 font-bold text-white disabled:opacity-50">حفظ التغييرات المحددة ({Object.keys(changes).length})</button>
  </form>;
}
