'use client';
import {useId,useMemo,useState} from 'react';
import { SearchAreaPicker } from '@/components/search-area-picker';
import { SearchSuggestInput } from '@/components/search-suggest';
import { ChevronDown, Search } from 'lucide-react';
import type {CategoryFormConfig} from '@/lib/ad-categories/contracts';
import {fieldApplies,type CategoryField} from '@/lib/ad-categories/validation';
import {publicCategoryGroups} from '@/lib/home-feed';

type Region = { id: number; name: string; countryId?: number };
type Area = { id: number; name: string; cityId: number };

export function PublicSearchForm({ regions, areas, params = {}, priceOn = true, placeholder = 'ماذا تبحث عنه؟', compact = false,categoryConfig }: {
  regions: Region[]; areas: Area[]; params?: Record<string, string | undefined>;
  priceOn?: boolean; placeholder?: string; compact?: boolean;categoryConfig?:CategoryFormConfig;
}) {
  const field = 'h-11 min-w-0 w-full rounded-lg border bg-background px-3 text-sm text-foreground';
  const [advancedOpen,setAdvancedOpen]=useState(false);
  const advancedId=useId();
  const [category,setCategory]=useState(params.category||'');
  const [subcategory,setSubcategory]=useState(params.subcategory||'');
  const [listingType,setListingType]=useState(params.listingType||'');
  const groups=useMemo(()=>categoryConfig?publicCategoryGroups(categoryConfig).filter(group=>categoryConfig.subcategories.some(item=>item.active&&item.version>0&&(item.groupKey||String(item.categoryId))===group.key)):[],[categoryConfig]);
  const subcategories=useMemo(()=>categoryConfig?.subcategories.filter(item=>item.active&&item.version>0&&(item.groupKey||String(item.categoryId))===category)||[],[category,categoryConfig]);
  const selectedSub=subcategories.find(item=>String(item.id)===subcategory);
  const listingTypes=selectedSub?.listingPolicy?.types||[];
  const dependentValues=Object.fromEntries(Object.entries(params).filter(([key])=>key.startsWith('attr_')).map(([key,value])=>[key.slice(5),value||'']));
  const dynamicFields=(selectedSub?.fields||[]).filter(item=>item.filterable&&fieldApplies(item,{listingType,values:dependentValues}));
  const dynamicGroups=[...new Set(dynamicFields.map(item=>item.group||'مواصفات'))].map(group=>({group,fields:dynamicFields.filter(item=>(item.group||'مواصفات')===group)}));
  const categoryFilters=categoryConfig?.enabled?<>
    <label className="space-y-1 text-xs font-semibold text-foreground">القسم
      <select name="category" value={category} className={field} onChange={event=>{setCategory(event.target.value);setSubcategory('');setListingType('');}}><option value="">كل الأقسام</option>{groups.map(item=><option key={item.key} value={item.key}>{item.name}</option>)}</select>
    </label>
    <label className="space-y-1 text-xs font-semibold text-foreground">القسم الفرعي
      <select name="subcategory" value={subcategory} disabled={!category} className={field} onChange={event=>{setSubcategory(event.target.value);setListingType('');}}><option value="">كل الأقسام الفرعية</option>{subcategories.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
    </label>
    {listingTypes.length>0&&<label className="space-y-1 text-xs font-semibold text-foreground">نوع العملية
      <select name="listingType" value={listingType} className={field} onChange={event=>setListingType(event.target.value)}><option value="">الكل</option>{listingTypes.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select>
    </label>}
    {dynamicGroups.map(({group,fields})=><fieldset key={group} data-filter-group={group} className="col-span-full rounded-lg border bg-muted/20 p-2.5">
      <legend className="px-1 text-xs font-bold text-foreground">{group}</legend>
      <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2 md:grid-cols-3">{fields.map(item=><CategoryFilterField key={item.key} field={item} params={params} inputClass={field}/>)}</div>
    </fieldset>)}
  </>:null;
  const filters = <>
    {categoryFilters}
    <SearchAreaPicker regions={regions} areas={areas} region={params.city || ''} area={params.area || ''} className={field} />
    <label className="space-y-1 text-xs font-semibold text-foreground">نوع الإعلان
      <select name="type" defaultValue={params.type || ''} className={field}>
        <option value="">عرض وطلب</option><option value="offer">عروض</option><option value="request">طلبات</option>
      </select>
    </label>
    {priceOn && <>
      <label className="space-y-1 text-xs font-semibold text-foreground">السعر من (ر.س)
        <input name="minPrice" type="number" min="0" max="2147483647" step="0.01" inputMode="decimal" defaultValue={params.minPrice || ''} className={field} placeholder="بدون حد أدنى" />
      </label>
      <label className="space-y-1 text-xs font-semibold text-foreground">السعر إلى (ر.س)
        <input name="maxPrice" type="number" min="0" max="2147483647" step="0.01" inputMode="decimal" defaultValue={params.maxPrice || ''} className={field} placeholder="بدون حد أعلى" />
      </label>
    </>}
    {!compact && <label className="space-y-1 text-xs font-semibold text-foreground">ترتيب النتائج
      <select name="sort" defaultValue={params.sort || 'newest'} className={field}>
        <option value="newest">الأحدث</option><option value="price_asc">السعر: من الأقل</option><option value="price_desc">السعر: من الأعلى</option>
      </select>
    </label>}
  </>;
  return <form action="/search" method="get" role="search" className={compact ? 'space-y-2' : 'space-y-3'}>
    {!categoryConfig?.enabled&&params.category && <input name="category" type="hidden" value={params.category} />}
    <div className="flex items-end gap-2">
      <label className="min-w-0 flex-1 space-y-1 text-xs font-semibold text-foreground">البحث في الإعلانات
        <SearchSuggestInput key={params.q || ''} name="q" defaultValue={params.q || ''} placeholder={placeholder} />
      </label>
      <button type="submit" className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground hover:opacity-90"><Search className="h-4 w-4" /> بحث</button>
    </div>
    {params.special === '1' && <input name="special" type="hidden" value="1" />}
    {compact ? <>
      <button type="button" aria-expanded={advancedOpen} aria-controls={advancedId} onClick={()=>setAdvancedOpen(open=>!open)} className="flex min-h-11 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        بحث متقدم<ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${advancedOpen?'rotate-180':''}`}/>
      </button>
      <div id={advancedId} inert={!advancedOpen} aria-hidden={!advancedOpen} className={`grid transition-[grid-template-rows,visibility] duration-200 motion-reduce:transition-none ${advancedOpen?'visible grid-rows-[1fr]':'invisible grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden"><div className="grid grid-cols-1 items-end gap-3 pb-1 sm:grid-cols-3">{filters}</div></div>
      </div>
    </> : <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-3">{filters}</div>}
  </form>;
}

function CategoryFilterField({field,params,inputClass}:{field:CategoryField;params:Record<string,string|undefined>;inputClass:string}){
  const name=`attr_${field.key}`;
  const label=field.unit?`${field.label} (${field.unit})`:field.label;
  if(['number','decimal','year','range'].includes(field.type))return <div className="grid grid-cols-2 gap-2"><label className="space-y-1 text-xs font-semibold">{label} من<input name={`${name}_min`} type="number" step={field.step??'any'} min={field.min} max={field.max} defaultValue={params[`${name}_min`]||''} className={inputClass}/></label><label className="space-y-1 text-xs font-semibold">{label} إلى<input name={`${name}_max`} type="number" step={field.step??'any'} min={field.min} max={field.max} defaultValue={params[`${name}_max`]||''} className={inputClass}/></label></div>;
  if(field.type==='multiselect')return <MultiSelectCategoryFilter field={field} label={label} name={name} initial={params[name]||''}/>;
  if(field.type==='select'||field.type==='radio')return <label className="space-y-1 text-xs font-semibold">{label}<select name={name} defaultValue={params[name]||''} className={inputClass}><option value="">الكل</option>{field.options.map(option=><option key={option} value={option}>{option}</option>)}</select></label>;
  if(field.type==='boolean')return <label className="space-y-1 text-xs font-semibold">{label}<select name={name} defaultValue={params[name]||''} className={inputClass}><option value="">الكل</option><option value="1">نعم</option><option value="0">لا</option></select></label>;
  return <label className="space-y-1 text-xs font-semibold">{label}<input name={name} defaultValue={params[name]||''} maxLength={120} className={inputClass}/></label>;
}

function MultiSelectCategoryFilter({field,label,name,initial}:{field:CategoryField;label:string;name:string;initial:string}){
  const [selected,setSelected]=useState(()=>initial.split(',').filter(value=>field.options.includes(value)));
  const toggle=(value:string)=>setSelected(current=>current.includes(value)?current.filter(item=>item!==value):[...current,value]);
  return <fieldset className="rounded-lg border bg-background p-2">
    <legend className="px-1 text-xs font-semibold">{label}</legend>
    <input type="hidden" name={name} value={selected.join(',')}/>
    <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
      {field.options.map(option=><label key={option} className={`cursor-pointer rounded-full border px-2 py-1 text-xs font-semibold ${selected.includes(option)?'border-primary bg-primary text-white':'bg-white text-foreground'}`}>
        <input type="checkbox" className="sr-only" checked={selected.includes(option)} onChange={()=>toggle(option)}/>{option}
      </label>)}
    </div>
  </fieldset>;
}
