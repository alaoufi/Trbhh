'use client';
import {useState} from 'react';
import {CategoryMergeEditor,type MergeOperations} from '@/components/category-merge-editor';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ConfirmSubmit} from '@/components/confirm-submit';
import {categoryReviewColor,type TreeCategory} from '@/lib/ad-categories/tree';
import type {CategoryTreeAd} from '@/app/admin/categories/tree-actions';
type Result={ok:boolean;error?:string;deleted?:boolean;archived?:boolean};
type Operations={load:(category:number,sub:number|null,cursor?:string)=>Promise<{items:CategoryTreeAd[];next:string|null}>;removeNode:(id:number,parent:number|null)=>Promise<Result>;removeAd:(id:string,mode:'archive'|'delete')=>Promise<Result>};
function DeleteNode({id,parent,disabled,action}:{id:number;parent:number|null;disabled:boolean;action:Operations['removeNode']}){
 const router=useRouter();const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <div><form action={async()=>{if(busy)return;setBusy(true);setError('');try{const r=await action(id,parent);if(r.ok)router.refresh();else setError(r.error||'لم يتم الحذف');}catch{setError('تعذر تأكيد الحذف. حدّث العرض للتحقق.');}finally{setBusy(false);}}}><ConfirmSubmit disabled={disabled||busy} title={disabled?'يجب إفراغ هذا القسم أولاً':'حذف القسم الفارغ'} msg="حذف هذا القسم الفارغ نهائياً؟ سيتحقق النظام مجدداً من الإعلانات والفروع والارتباطات قبل الحذف." className="min-h-11 rounded-lg border border-red-200 px-3 text-sm text-red-700 disabled:opacity-40">{busy?'جارٍ التحقق…':parent===null?'حذف الرئيسي':'حذف الفرع'}</ConfirmSubmit></form>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
function AdList({category,sub,count,canRead,canDelete,canArchive,ops}:{category:number;sub:number|null;count:number;canRead:boolean;canDelete:boolean;canArchive:boolean;ops:Operations}){
 const router=useRouter();const [items,setItems]=useState<CategoryTreeAd[]>([]),[loaded,setLoaded]=useState(false),[next,setNext]=useState<string|null>(null),[busy,setBusy]=useState(false),[deleting,setDeleting]=useState<string|null>(null),[error,setError]=useState('');
 async function load(){if(busy)return;setBusy(true);setError('');try{const r=await ops.load(category,sub,loaded?next??undefined:undefined);setItems(old=>loaded?[...old,...r.items.filter(a=>!old.some(b=>b.id===a.id))]:r.items);setNext(r.next);setLoaded(true);}catch{setError('تعذر تحميل الإعلانات. حاول مجدداً.');}finally{setBusy(false);}}
 return <details className="rounded-lg border bg-white p-2" onToggle={e=>{if(e.currentTarget.open&&!loaded&&!busy&&canRead)void load();}}><summary className="min-h-11 cursor-pointer py-2 font-bold">{sub===null?'إعلانات مباشرة أو بفرع غير تابع':'إعلانات الفرع'} — {count} إعلان</summary>
 {!canRead?<p>تحتاج صلاحية عرض الإعلانات لقراءة تفاصيلها.</p>:<div className="space-y-2">
 {busy&&<p role="status">جارٍ تحميل الإعلانات…</p>}{error&&<p role="alert" className="text-sm text-red-700">{error} <button className="underline" onClick={()=>void load()}>إعادة المحاولة</button></p>}
 {items.map(ad=><article key={ad.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2"><div className="min-w-0 flex-1"><Link href={`/ads/${ad.id}`} className="break-words font-bold">{ad.title||`إعلان #${ad.id}`}</Link><p className="text-xs text-slate-500">#{ad.id} · أضيف <time dateTime={ad.date??undefined} title={ad.date?new Date(ad.date).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'}):undefined}>{ad.age}</time>{ad.archived?' · مؤرشف':''}</p></div>
 {(ad.archived?canDelete:canArchive)&&<form action={async()=>{if(deleting)return;setDeleting(ad.id);setError('');try{const r=await ops.removeAd(ad.id,ad.archived?'delete':'archive');if(r.ok){setItems(old=>r.deleted?old.filter(a=>a.id!==ad.id):old.map(a=>a.id===ad.id?{...a,archived:true}:a));router.refresh();}else setError(r.error||'لم يتم الحذف');}catch{setError('تعذر تأكيد العملية. حدّث العرض للتحقق.');}finally{setDeleting(null);}}}><ConfirmSubmit disabled={deleting!==null} msg={ad.archived?`حذف الإعلان «${ad.title}» نهائياً؟ لا يمكن التراجع. ستمنع السجلات المرتبطة الحذف.`:`نقل الإعلان «${ad.title}» للأرشيف أولاً؟ سيبقى محسوباً حتى حذفه نهائياً.`} className="min-h-11 rounded-lg border border-red-200 px-3 text-sm text-red-700">{deleting===ad.id?'جارٍ التنفيذ…':ad.archived?'حذف نهائي':'حذف — أرشفة أولاً'}</ConfirmSubmit></form>}
 </article>)}
 {loaded&&!items.length&&<p className="text-sm">لا توجد إعلانات.</p>}{next&&<button className="min-h-11 rounded-lg border px-3" disabled={busy} onClick={()=>void load()}>عرض المزيد من الإعلانات</button>}
 </div>}
 </details>;
}
export function CategoryAdminTree({categories,canReadAds,canDeleteAds,canArchiveAds,canDeleteCategories,merge,...ops}:{categories:TreeCategory[];canReadAds:boolean;canDeleteAds:boolean;canArchiveAds:boolean;canDeleteCategories:boolean;merge?:MergeOperations}&Operations){
 return <section className="min-w-0 space-y-3" aria-label="شجرة الأقسام والإعلانات"><p className="rounded-lg bg-amber-50 p-3 text-sm">العدد يشمل كل حالات الإعلانات، بما فيها المخفية والمؤرشفة. للحذف النهائي: أرشف الإعلان أولاً ثم احذفه. لا يُحذف الفرع وفيه إعلان، ولا الرئيسي وفيه فرع أو إعلان. قد تمنع ارتباطات أخرى الحذف.</p><p className="text-sm">اللون المشترك يميز أسماء مكررة أو تداخلاً محتملاً للمراجعة؛ ليس دليلاً على تطابق المحتوى. الأقسام المخفية ظاهرة هنا أيضاً. هذه الشجرة تجمع المتشابه للمراجعة؛ <Link className="underline" href="/admin/categories?view=order">غيّر ترتيب العرض بالسحب والإفلات</Link>.</p>
 {categories.map(c=><details key={c.id} className="rounded-xl border-2 p-3" style={c.similar?categoryReviewColor(c.similar):undefined}><summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 font-bold"><span>▸ {c.name} <small>#{c.id}{c.active?'':' · مخفي'}</small></span><span>{c.children.length} فروع · {c.ads} إعلان</span></summary>
 {c.similar&&<p className="mt-2 text-xs">مجموعة مراجعة: {c.similar}</p>}
 <div className="mt-3 flex flex-wrap gap-2"><Link className="min-h-11 rounded-lg border bg-white p-2 text-sm" href={`/admin/categories?view=manage&category=${c.id}`}>تعديل القسم وحقوله</Link>{canDeleteCategories&&<DeleteNode id={c.id} parent={null} disabled={c.children.length>0||c.ads>0} action={ops.removeNode}/>}</div>
 {merge&&<CategoryMergeEditor source={c} targets={categories} operations={merge}/>}
 <div className="mt-3 space-y-2">{c.directAds>0&&<AdList category={c.id} sub={null} count={c.directAds} canRead={canReadAds} canDelete={canDeleteAds} canArchive={canArchiveAds} ops={ops}/>}
 {c.children.map(s=><details key={s.id} className="rounded-xl border-2 bg-white p-3" style={s.similar?categoryReviewColor('فرع:'+s.similar):undefined}><summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 font-bold"><span>▸ {s.name} <small>#{s.id}{s.active?'':' · مخفي'}</small></span><span>{s.ads} إعلان</span></summary><div className="mt-2 space-y-2"><div className="flex flex-wrap gap-2"><Link className="min-h-11 rounded-lg border bg-white p-2 text-sm" href={`/admin/categories?sub=${s.id}&section=fields`}>تعديل حقول الفرع</Link>{canDeleteCategories&&<DeleteNode id={s.id} parent={c.id} disabled={s.ads>0} action={ops.removeNode}/>}</div><AdList category={c.id} sub={s.id} count={s.ads} canRead={canReadAds} canDelete={canDeleteAds} canArchive={canArchiveAds} ops={ops}/></div></details>)}
 {!c.children.length&&<p className="text-sm">لا توجد فروع.</p>}</div>
 </details>)}
 </section>;
}
