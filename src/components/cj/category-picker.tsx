'use client';
import {useId,useMemo,useState} from 'react';
import {cjCategoryTree,findCategoryPath,type CatalogCategoryOption} from '@/lib/cj/category-tree';
export function CjCategoryPicker({categories,selected}:{categories:CatalogCategoryOption[];selected:string}){
 const tree=useMemo(()=>cjCategoryTree(categories),[categories]),id=useId();
 const [path,setPath]=useState(()=>findCategoryPath(tree,selected));
 let nodes=tree,categoryId='';
 const fields=[];
 const labels=['القسم الرئيسي','القسم الفرعي','القسم الفرعي الأخير'];
 for(let depth=0;depth<3;depth++){
  const options=nodes,current=options.find(n=>n.key===path[depth]);
  if(current?.categoryId)categoryId=current.categoryId;
  const level=depth;
  fields.push(<label key={depth} htmlFor={`${id}-${depth}`} className="text-sm">{labels[depth]}<select id={`${id}-${depth}`} value={path[depth]||''} disabled={!options.length} required={depth>0&&options.length>0} onChange={e=>setPath([...path.slice(0,level),e.target.value])} className="ms-2 min-h-9 w-56 rounded-lg border border-primary/25 bg-white px-2 py-1 text-sm disabled:bg-slate-100"><option value="">{depth===0?'جميع الأقسام':options.length?'اختر القسم':!path[depth-1]?(depth===1?'اختر الرئيسي أولًا':'اختر الفرعي أولًا'):'لا يوجد مستوى إضافي'}</option>{options.map(n=><option key={n.key} value={n.key}>{n.label}</option>)}</select></label>);
  nodes=current?.children||[];
 }
 return <><input type="hidden" name="cat" value={categoryId}/>{fields}</>;
}
