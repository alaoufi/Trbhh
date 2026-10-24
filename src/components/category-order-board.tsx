'use client';
import {useEffect,useRef,useState} from 'react';
import {GripVertical,ArrowUp,ArrowDown} from 'lucide-react';
import type {CategoryOrderItem,CategoryOrderRequest,CategoryOrderResult} from '@/lib/ad-categories/ordering';
import {moveCategoryItem} from '@/lib/ad-categories/ordering';
type Operations={save:(input:CategoryOrderRequest)=>Promise<CategoryOrderResult>;load:(parentId:number|null)=>Promise<CategoryOrderItem[]>};
function OrderList({items,parentId,canEdit,selected,onSelect,onSaved,onSaving,locked,save,load}:{items:CategoryOrderItem[];parentId:number|null;canEdit:boolean;selected?:number|null;onSelect?:(id:number)=>void;onSaved:(rows:CategoryOrderItem[])=>void;onSaving:(busy:boolean)=>void;locked:boolean}&Operations){
 const [rows,setRows]=useState(items),[saving,setSaving]=useState(false),[status,setStatus]=useState('');
 const current=useRef(items),busy=useRef(false),list=useRef<HTMLUListElement>(null);
 const drag=useRef<{id:number;before:CategoryOrderItem[]}|null>(null);
 function show(next:CategoryOrderItem[]){current.current=next;setRows(next);}
 async function commit(next:CategoryOrderItem[],before:CategoryOrderItem[]){
  if(locked){show(before);return;}
  if(busy.current||next.every((r,i)=>r.id===before[i]?.id))return;
  busy.current=true;setSaving(true);onSaving(true);setStatus('جارٍ حفظ الترتيب…');show(next);
  try{const result=await save({parentId,ids:next.map(r=>r.id),expected:before.map(({id,order})=>({id,order}))});show(result.items);onSaved(result.items);setStatus('تم حفظ الترتيب ✓');}
  catch{show(before);setStatus('تعذّر تأكيد حفظ الترتيب. حدّث القائمة قبل إعادة السحب.');}
  finally{busy.current=false;setSaving(false);onSaving(false);}
 }
 function move(id:number,direction:number){if(busy.current||locked||drag.current)return;const before=current.current,index=before.findIndex(r=>r.id===id),target=before[index+direction];if(target)void commit(moveCategoryItem(before,id,target.id),before);}
 function cancel(){if(drag.current){show(drag.current.before);drag.current=null;setStatus('أُلغي السحب');}}
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();const before=drag.current.before;drag.current=null;current.current=before;setRows(before);setStatus('أُلغي السحب');}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[]);
 return <div className="min-w-0 space-y-2" aria-busy={saving}>
  <p role="status" aria-live="polite" className="min-h-6 text-sm">{status}</p>
  {(status.startsWith('لم')||status.startsWith('تعذّر'))&&<button type="button" className="min-h-11 rounded-lg border px-3 text-sm" disabled={saving||locked} onClick={async()=>{if(busy.current||locked)return;busy.current=true;setSaving(true);try{const fresh=await load(parentId);show(fresh);onSaved(fresh);setStatus('تم تحديث القائمة؛ أعد ترتيبها');}catch{setStatus('لم تُحمّل القائمة. حاول مجدداً.');}finally{busy.current=false;setSaving(false);}}}>تحديث القائمة</button>}
  <ul ref={list} className="max-h-[65vh] space-y-2 overflow-y-auto rounded-xl border p-2" aria-label={parentId===null?'ترتيب الأقسام الرئيسية':'ترتيب الفروع'}
     onPointerMove={e=>{const d=drag.current;if(!d)return;const box=list.current?.getBoundingClientRect();if(box&&e.clientY<box.top+35)list.current?.scrollBy(0,-16);if(box&&e.clientY>box.bottom-35)list.current?.scrollBy(0,16);const target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-order-item]');if(!target||!list.current?.contains(target))return;const to=Number(target.dataset.orderItem);if(to===d.id)return;const from=current.current.findIndex(r=>r.id===d.id),index=current.current.findIndex(r=>r.id===to),rect=target.getBoundingClientRect(),mid=rect.top+rect.height/2;if(from<index&&e.clientY<mid||from>index&&e.clientY>mid)return;show(moveCategoryItem(current.current,d.id,to));}}
     onPointerUp={e=>{const d=drag.current;if(!d)return;drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);void commit(current.current,d.before);}}
     onPointerCancel={cancel} onLostPointerCapture={()=>{if(drag.current)cancel();}}>
   {rows.map((row,index)=><li key={row.id} data-order-item={row.id} className={'flex min-w-0 items-center gap-1 rounded-lg border p-1 '+(selected===row.id?'border-primary bg-primary/10':'bg-white')}>
    <button type="button" aria-label={'اسحب لترتيب '+row.name} disabled={!canEdit||saving||locked} className="grid h-11 w-11 shrink-0 touch-none select-none place-items-center rounded-lg border text-primary disabled:opacity-40" style={{touchAction:'none'}}
     onKeyDown={e=>{if(e.key==='Escape')cancel();else if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();move(row.id,e.key==='ArrowUp'?-1:1);}}}
     onPointerDown={e=>{if(e.button!==0||busy.current||locked||!canEdit)return;e.preventDefault();drag.current={id:row.id,before:current.current};e.currentTarget.focus();list.current?.setPointerCapture(e.pointerId);setStatus('اسحب إلى الموضع المطلوب ثم أفلت للحفظ');}}
><GripVertical className="h-5 w-5"/></button>
    <button type="button" onClick={()=>onSelect?.(row.id)} disabled={!onSelect||saving||locked} aria-pressed={onSelect?selected===row.id:undefined} className="min-h-11 min-w-0 flex-1 break-words px-2 text-right text-sm font-bold disabled:text-foreground">{row.name}<small className="mr-1 font-normal text-slate-500">#{row.id}{row.active?'':' · مخفي'}</small></button>
    <button type="button" aria-label={'رفع '+row.name} disabled={!canEdit||saving||index===0} onClick={()=>move(row.id,-1)} className="grid h-11 w-9 shrink-0 place-items-center rounded border disabled:opacity-30"><ArrowUp className="h-4 w-4"/></button>
    <button type="button" aria-label={'خفض '+row.name} disabled={!canEdit||saving||index===rows.length-1} onClick={()=>move(row.id,1)} className="grid h-11 w-9 shrink-0 place-items-center rounded border disabled:opacity-30"><ArrowDown className="h-4 w-4"/></button>
   </li>)}
   {!rows.length&&<li className="p-3 text-sm text-slate-500">لا توجد فروع لهذا القسم.</li>}
  </ul>
 </div>;
}
export function CategoryOrderBoard({categories,subcategories,initialCategory,canEdit,...ops}:{categories:CategoryOrderItem[];subcategories:(CategoryOrderItem&{categoryId:number})[];initialCategory?:number|null;canEdit:boolean}&Operations){
 const [boardBusy,setBoardBusy]=useState(false);
 const [roots,setRoots]=useState(categories),[subs,setSubs]=useState(subcategories),[selected,setSelected]=useState(initialCategory&&categories.some(c=>c.id===initialCategory)?initialCategory:categories[0]?.id??null);
 const root=roots.find(c=>c.id===selected);
 return <section className="min-w-0 space-y-3" aria-label="ترتيب الأقسام بالسحب والإفلات"><p className="rounded-xl bg-slate-50 p-3 text-sm leading-7">اسحب من المقبض لترتيب العناصر؛ يُحفظ الترتيب عند الإفلات. اضغط اسم الرئيسي لعرض فروعه. يمكنك استخدام الأسهم أو لوحة المفاتيح أيضاً. ترتيب الفروع داخل رئيسيها فقط.</p>{!canEdit&&<p>العرض فقط؛ تغيير الترتيب يتطلب صلاحية تعديل الأقسام.</p>}
 <div className="grid min-w-0 gap-4 lg:grid-cols-2"><div className="min-w-0"><h2 className="font-bold">الأقسام الرئيسية</h2><OrderList items={roots} parentId={null} canEdit={canEdit} onSaving={setBoardBusy} locked={boardBusy} selected={selected} onSelect={setSelected} onSaved={setRoots} {...ops}/></div><div className="min-w-0"><h2 className="font-bold">{root?'فروع '+root.name:'اختر قسماً رئيسياً'}</h2>{root&&<OrderList key={root.id} items={subs.filter(s=>s.categoryId===root.id)} parentId={root.id} canEdit={canEdit} onSaving={setBoardBusy} locked={boardBusy} onSaved={rows=>setSubs(old=>[...old.filter(s=>s.categoryId!==root.id),...rows.map(r=>({...r,categoryId:root.id}))])} {...ops}/>}</div></div>
 </section>;
}
