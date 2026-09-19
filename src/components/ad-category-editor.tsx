'use client';
import {useState} from 'react';
import {CATEGORY_KINDS,type CategoryKind,type SubcategoryOption} from '@/lib/ad-categories/contracts';
import type {CategoryField} from '@/lib/ad-categories/validation';
import {CATEGORY_SEED_TEMPLATES} from '@/lib/ad-categories/seed-templates';
import {nextCategoryFieldKey} from '@/lib/ad-categories/admin-input';
const input='w-full rounded-lg border border-primary/25 bg-white p-2 text-sm';
export function AdCategoryEditor({initial,categoryId,action}:{initial?:SubcategoryOption;categoryId:number;action:(fd:FormData)=>Promise<void>}){
  const [fields,setFields]=useState<CategoryField[]>(initial?.fields||[]);
  const [kind,setKind]=useState<CategoryKind>(initial?.kind||'other');
  const [price,setPrice]=useState(initial?.priceEnabled??false),[goods,setGoods]=useState(initial?.goodsEnabled??false);
  const [template,setTemplate]=useState('');
  const update=(i:number,patch:Partial<CategoryField>)=>setFields(fields.map((f,n)=>n===i?{...f,...patch}:f));
  return <form action={action} className="space-y-3 rounded-xl border p-3">
    {initial&&<input type="hidden" name="id" value={initial.id}/>}
    <input type="hidden" name="category_id" value={categoryId}/><input type="hidden" name="version" value={initial?.version??0}/><input type="hidden" name="fields_json" value={JSON.stringify(fields)}/>
    <div className="grid gap-2 sm:grid-cols-3"><label>اسم القسم الفرعي<input name="name" className={input} required maxLength={200} defaultValue={initial?.name}/></label><label>الترتيب<input name="order" type="number" min={0} max={10000} className={input} defaultValue={initial?.order??0}/></label><label>النوع<select name="kind" className={input} value={kind} onChange={e=>setKind(e.target.value as CategoryKind)}>{CATEGORY_KINDS.map(k=><option key={k} value={k}>{({goods:'سلع',property:'عقارات',jobs:'وظائف',service:'خدمات',livestock:'مواشٍ',plants:'نباتات',other:'أخرى'})[k]}</option>)}</select></label></div>
    <div className="flex flex-wrap gap-4"><label><input type="checkbox" name="price_enabled" value="1" checked={kind!=='jobs'&&price} disabled={kind==='jobs'} onChange={e=>setPrice(e.target.checked)}/> إظهار السعر العام</label><label><input type="checkbox" name="goods_enabled" value="1" checked={kind!=='jobs'&&goods} disabled={kind==='jobs'} onChange={e=>setGoods(e.target.checked)}/> إظهار تفاصيل السلع العامة</label></div>
    <div className="flex flex-wrap gap-2"><select aria-label="قالب الحقول" className={input} value={template} onChange={e=>setTemplate(e.target.value)}><option value="">اختر قالباً اختيارياً</option>{CATEGORY_SEED_TEMPLATES.map(t=><option key={t.key} value={t.key}>{t.categoryName} — {t.name}</option>)}</select><button type="button" disabled={!template} className="rounded border px-3 py-2" onClick={()=>{const t=CATEGORY_SEED_TEMPLATES.find(t=>t.key===template);if(t){setFields(t.fields.map(f=>({...f,options:[...f.options]})));setKind(t.kind);setPrice(t.priceEnabled);setGoods(t.goodsEnabled);}}}>استبدال حقول المحرر بالقالب المختار</button><p className="text-xs text-muted-foreground">لا يُطبّق على الإعلانات أو قاعدة البيانات حتى تحفظ هذا القسم الفرعي.</p></div>
    {fields.map((f,i)=><fieldset key={i} className="grid gap-2 rounded-lg border bg-primary/5 p-3 sm:grid-cols-3"><legend>حقل {i+1}</legend>
      <label>المعرف الثابت<input className={input} required pattern="[a-z][a-z0-9_]{0,47}" value={f.key} onChange={e=>update(i,{key:e.target.value})}/></label>
      <label>اسم الحقل<input className={input} required maxLength={120} value={f.label} onChange={e=>update(i,{label:e.target.value})}/></label>
      <label>النوع<select className={input} value={f.type} onChange={e=>update(i,{type:e.target.value as CategoryField['type']})}>{(['text','textarea','number','select','multiselect','boolean','date'] as const).map(t=><option key={t} value={t}>{({text:'نص',textarea:'نص طويل',number:'رقم',select:'اختيار واحد',multiselect:'اختيارات متعددة',boolean:'نعم / لا',date:'تاريخ'})[t]}</option>)}</select></label>
      <label>المجموعة<input className={input} maxLength={100} value={f.group} onChange={e=>update(i,{group:e.target.value})}/></label>
      <label>الترتيب<input className={input} type="number" min={0} max={10000} value={f.order} onChange={e=>update(i,{order:Number(e.target.value)})}/></label>
      <label>الوحدة<input className={input} maxLength={30} value={f.unit||''} onChange={e=>update(i,{unit:e.target.value})}/></label>
      {f.type==='number'&&(['min','max'] as const).map(k=><label key={k}>{k==='min'?'الحد الأدنى':'الحد الأعلى'}<input className={input} type="number" step="any" value={f[k]??''} onChange={e=>update(i,{[k]:e.target.value===''?undefined:Number(e.target.value)})}/></label>)}
      {(f.type==='select'||f.type==='multiselect')&&<label className="sm:col-span-3">الخيارات — خيار بكل سطر<textarea className={input} required value={f.options.join('\n')} onChange={e=>update(i,{options:e.target.value.split('\n')})}/></label>}
      <label><input type="checkbox" checked={f.required} onChange={e=>update(i,{required:e.target.checked})}/> مطلوب عند الظهور</label><label><input type="checkbox" checked={f.visible} onChange={e=>update(i,{visible:e.target.checked})}/> ظاهر</label><button type="button" className="text-red-700" onClick={()=>setFields(fields.filter((_,n)=>n!==i))}>إزالة الحقل</button>
    </fieldset>)}
    <div className="flex gap-3"><button type="button" className="rounded border px-3 py-2" onClick={()=>setFields(current=>[...current,{key:nextCategoryFieldKey(current),label:'',type:'text',group:'',required:false,visible:true,order:current.length,options:[]}])}>إضافة حقل</button><button className="rounded bg-primary px-4 py-2 text-white">حفظ القسم الفرعي</button></div>
  </form>;
}
