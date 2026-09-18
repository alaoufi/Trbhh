'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {listings} from '../lib/demo-data';
import {catalog,getProfile} from '../lib/category-fields';
import {CLASSIFICATION_KEY,type Target} from '../lib/classification';
import {resolveAd,readAssignments,CLASSIFICATION_EVENT,type Assignments} from '../lib/classification-store';
import {readLocal,writeLocal} from '../lib/preview';
import {FIELD_SETTINGS_KEY,applyFieldSettings,type FieldSettings} from '../lib/field-settings';
import {Modal} from './ui';
import './seller.css';
import './category-details.css';
import './catalog-management.css';
type RawAd={id:string;title:string;category?:string;subcategory?:string;image?:string;images?:string[];details?:unknown;classificationArchive?:unknown[];classificationRevision?:string};
type Row={key:string;source:'market'|'local';raw:RawAd;ad:ReturnType<typeof resolveAd<RawAd>>};
function rowsFrom(overrides:Assignments):Row[]{
  const stored=readLocal<unknown>('seller-ads-v1',[]);
  const local=Array.isArray(stored)?stored.filter((ad):ad is RawAd=>ad && typeof ad.id==='string' && typeof ad.title==='string'):[];
  return [...listings.map(raw=>({key:'market:'+raw.id,source:'market' as const,raw,ad:resolveAd(raw,'market',overrides)})),...local.map(raw=>({key:'local:'+raw.id,source:'local' as const,raw,ad:resolveAd(raw,'local',overrides)}))];
}
export function ClassificationManager(){
  const [rows,setRows]=useState<Row[]>([]);
  const [ready,setReady]=useState(false);
  const [filter,setFilter]=useState('all');
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState<string[]>([]);
  const [category,setCategory]=useState('أخرى');
  const [subcategory,setSubcategory]=useState('أخرى');
  const [settings,setSettings]=useState<FieldSettings>({});
  const [message,setMessage]=useState('');
  const [pending,setPending]=useState<{rows:Row[];target:Target;before:Assignments}|null>(null);
  const [undo,setUndo]=useState<{before:Assignments;after:Assignments;rows:Row[]}|null>(null);
  function refresh(){setRows(rowsFrom(readAssignments()));setSettings(readLocal(FIELD_SETTINGS_KEY,{}));setSelected([]);setReady(true);}
  useEffect(()=>{refresh();window.addEventListener('storage',refresh);return()=>window.removeEventListener('storage',refresh);},[]);
  const visible=rows.filter(row=>(filter==='all'||row.ad.classificationReview) && (row.raw.title+' '+row.raw.id).includes(query.trim()));
  const selectedRows=rows.filter(row=>selected.includes(row.key));
  const enabled=(cat:string,sub:string)=>Boolean(applyFieldSettings(getProfile(cat,sub),settings?.[cat+'/'+sub]));
  const allChecked=visible.length>0 && visible.every(row=>selected.includes(row.key));
  function prepare(chosen:Row[],target:Target){
    if(!chosen.length||!enabled(target.category,target.subcategory))return;
    setPending({rows:chosen,target,before:readAssignments()});setMessage('');
  }
  function save(){
    if(!pending)return;
    const current=readAssignments();
    const latest=rowsFrom(current);
    const currentSettings=readLocal<FieldSettings>(FIELD_SETTINGS_KEY,{});
    if(!applyFieldSettings(getProfile(pending.target.category,pending.target.subcategory),currentSettings?.[pending.target.category+'/'+pending.target.subcategory])){
      setPending(null);setMessage('أُخفي الفرع المستهدف. اختر فرعاً مفعلاً.');refresh();return;
    }
    if(JSON.stringify(current)!==JSON.stringify(pending.before) || pending.rows.some(row=>JSON.stringify(latest.find(item=>item.key===row.key)?.raw)!==JSON.stringify(row.raw))){
      setPending(null);refresh();setMessage('تغيرت البيانات في تبويب آخر. راجع الاختيار ثم أعد المحاولة.');return;
    }
    const next={...current};
    for(const row of pending.rows) next[row.key]={...pending.target,fromCategory:row.raw.category,fromSubcategory:row.raw.subcategory,fromRevision:row.raw.classificationRevision,updatedAt:Date.now()};
    writeLocal(CLASSIFICATION_KEY,next);
    if(JSON.stringify(readAssignments())!==JSON.stringify(next)){setMessage('تعذر حفظ التصنيف. لم نؤكد أي تحويل؛ حاول مجدداً.');setPending(null);return;}
    setUndo({before:current,after:next,rows:pending.rows});setMessage(`تم تحويل ${pending.rows.length} إعلان. النصوص والصور محفوظة دون تغيير.`);
    setPending(null);refresh();window.dispatchEvent(new Event(CLASSIFICATION_EVENT));window.dispatchEvent(new Event('trbhh-seller-updated'));
  }
  function rollback(){
    if(!undo)return;
    if(JSON.stringify(readAssignments())!==JSON.stringify(undo.after)){setMessage('تغير التصنيف بعد آخر عملية؛ لا يمكن التراجع تلقائياً دون إلغاء تغييرات أحدث.');return;}
    const latest=rowsFrom(readAssignments());
    if(undo.rows.some(row=>JSON.stringify(latest.find(item=>item.key===row.key)?.raw)!==JSON.stringify(row.raw))){setMessage('تغيرت بيانات إعلان بعد التحويل؛ لا يمكن التراجع دون إلغاء تغييرات أحدث.');return;}
    writeLocal(CLASSIFICATION_KEY,undo.before);
    if(JSON.stringify(readAssignments())!==JSON.stringify(undo.before)){setMessage('تعذر حفظ التراجع.');return;}
    setUndo(null);refresh();setMessage('تم التراجع عن آخر دفعة.');window.dispatchEvent(new Event(CLASSIFICATION_EVENT));window.dispatchEvent(new Event('trbhh-seller-updated'));
  }
  return <div className="container seller-page compact-fields">
    <div className="seller-page-head"><div><h1>تصنيف الإعلانات</h1><p>مراجعة التصنيفات وتعديلها فردياً أو دفعة واحدة.</p></div><Link href="/field-settings/" className="button secondary">إعدادات الحقول</Link></div>
    <div className="seller-demo-note">تجربة محلية فقط: تشمل أمثلة السوق والإعلانات المحفوظة في هذا المتصفح، ولا تتصل بالإعلانات الحية. العناوين الواضحة تُصنف تلقائياً، وما لم يتضح يوضع في «أخرى / أخرى» للمراجعة. التصنيفات الصحيحة الموجودة لا تستبدل تلقائياً.</div>
    <div className="classification-stats"><span>جميع الإعلانات: {rows.length}</span><span>بحاجة لتصنيف: {rows.filter(row=>row.ad.classificationReview).length}</span><span>المحدد: {selected.length}</span></div>
    <div className="classification-tools"><label className="seller-field">عرض الإعلانات<select aria-label="عرض الإعلانات" value={filter} onChange={e=>{setFilter(e.target.value);setSelected([]);}}><option value="all">جميع الإعلانات</option><option value="review">غير مصنفة / أخرى للمراجعة</option></select></label><label className="seller-field">البحث بالعنوان أو الرقم<input value={query} onChange={e=>{setQuery(e.target.value);setSelected([]);}} /></label><button className="button secondary" onClick={()=>{refresh();setMessage('تم تحديث القائمة.');}}>تحديث القائمة</button></div>
    <section className="classification-batch"><strong>وجهة التحويل</strong><div className="classification-tools"><label className="seller-field">القسم المستهدف<select value={category} onChange={e=>{setCategory(e.target.value);setSubcategory('');}}>{Object.keys(catalog).map(c=><option key={c}>{c}</option>)}</select></label><label className="seller-field">الفرع المستهدف<select value={subcategory} onChange={e=>setSubcategory(e.target.value)}><option value="">اختر الفرع</option>{Object.keys(catalog[category]).filter(sub=>enabled(category,sub)).map(sub=><option key={sub}>{sub}</option>)}</select></label><button className="button primary" disabled={!ready||!selected.length||!enabled(category,subcategory)} onClick={()=>prepare(selectedRows,{category,subcategory})}>تحويل المحدد ({selected.length})</button><button className="button secondary" disabled={!selected.length} onClick={()=>prepare(selectedRows,{category:'أخرى',subcategory:'أخرى'})}>وضع المحدد في أخرى</button><button className="button secondary" disabled={!undo} onClick={rollback}>تراجع عن آخر دفعة</button></div><small>راجع العدد والوجهة قبل التأكيد. عند تغيير الفرع تُؤرشف المواصفات القديمة ولا تُعرض كأنها تخص الفرع الجديد، وتبقى الصور والوصف والسعر دون تغيير.</small></section>
    <p role="status" className="classification-notice">{message}</p>
    <div className="classification-table-wrap"><table className="classification-table"><caption>الإعلانات الظاهرة ({visible.length}) — التحديد الجماعي يشمل الصفوف الظاهرة فقط</caption><thead><tr><th><input type="checkbox" aria-label="تحديد جميع الإعلانات الظاهرة" checked={allChecked} disabled={!visible.length} onChange={e=>setSelected(e.target.checked?visible.map(row=>row.key):[])} /></th><th>الإعلان</th><th>التصنيف الحالي</th><th>حالة التصنيف</th><th>تعديل</th></tr></thead><tbody>{visible.map(row=>{
      const src=row.raw.image||row.raw.images?.[0];
      return <tr key={row.key} data-ad-key={row.key}><td><input type="checkbox" aria-label={`تحديد ${row.raw.title}`} checked={selected.includes(row.key)} onChange={e=>setSelected(value=>e.target.checked?[...value,row.key]:value.filter(id=>id!==row.key))}/></td><td><div className="classification-title">{src && (src.startsWith('/images/')||/^data:image\/(jpeg|png|webp);base64,/.test(src)) && <img src={src} alt="" loading="lazy"/>}<div><strong>{row.raw.title}</strong><small>#{row.raw.id} · {row.source==='market'?'مثال السوق':'إعلان محلي'}</small><Link href={row.source==='market'?`/ads/${row.raw.id}/`:`/ads/new/?edit=${encodeURIComponent(row.raw.id)}`}>معاينة / تعديل الإعلان</Link></div></div></td><td>{row.ad.category}<br/><small>{row.ad.subcategory}</small></td><td>{row.ad.classificationReview?'بحاجة لمراجعة':row.ad.classificationSource==='auto'?'تلقائي واضح':row.ad.classificationSource==='manual'?'تعديل يدوي':'مصنف'}</td><td><button type="button" onClick={()=>{setSelected([row.key]);setCategory(row.ad.category);setSubcategory(row.ad.subcategory);document.querySelector('.classification-batch')?.scrollIntoView({block:'center'});setMessage('اختر الوجهة ثم اضغط تحويل المحدد.');}}>تعديل القسم</button></td></tr>;
    })}</tbody></table>{ready&&!visible.length&&<p className="seller-fields">لا توجد إعلانات ضمن هذا المرشح. لا توجد بيانات حية مخفية خلف هذه القائمة.</p>}</div>
    <Modal open={Boolean(pending)} onClose={()=>setPending(null)} title="تأكيد تحويل الإعلانات">{pending&&<><p>تحويل {pending.rows.length} إعلان إلى <strong>{pending.target.category} / {pending.target.subcategory}</strong>؟</p><ul className="classification-confirm-list">{pending.rows.map(row=><li key={row.key}>{row.raw.title}</li>)}</ul><p>لن تتغير الصور والنصوص. يمكنك التراجع عن آخر دفعة خلال هذه الجلسة.</p><div className="seller-modal-actions"><button className="button primary" onClick={save}>تأكيد التحويل</button><button className="button secondary" onClick={()=>setPending(null)}>إلغاء</button></div></>}</Modal>
  </div>;
}
