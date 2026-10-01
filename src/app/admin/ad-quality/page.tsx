import Link from 'next/link';
import {prisma} from '@/lib/prisma';
import {requirePerm} from '@/lib/roles';
import {getCategoryFormConfig} from '@/lib/ad-categories/service';
import {buildEditorReviewRow,type EditorReviewSource} from '@/lib/ad-quality/editor-review';
import type {CategoryValues} from '@/lib/ad-categories/validation';

export const dynamic='force-dynamic';
export const metadata={title:'مراجعة جودة الإعلانات'};
const PAGE_SIZE=50;

type RawRow={
  id:bigint;title:string;category_id:bigint;subcategory_id:number|null;
  category_name:string|null;category_active:string|null;subcategory_name:string|null;subcategory_active:number|null;
  subcategory_parent_id:number|null;city_name:string|null;area_name:string|null;location_matches:number;
  values_json:unknown;
};

const values=(raw:unknown):CategoryValues=>{
  try{
    const parsed=typeof raw==='string'?JSON.parse(raw):raw;
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as CategoryValues:{};
  }catch{return {};}
};

export default async function AdQualityReviewPage({searchParams}:{searchParams:Promise<{page?:string}>}){
  await requirePerm('ads');
  const [{page:pageRaw},cfg,rawRows]=await Promise.all([
    searchParams,getCategoryFormConfig(true),
    prisma.$queryRaw<RawRow[]>`
      SELECT a.id,a.title,a.category_id,a.subcategory_id,c.name AS category_name,c.is_active AS category_active,
        s.name AS subcategory_name,s.active AS subcategory_active,s.category_id AS subcategory_parent_id,
        ci.name AS city_name,ar.name AS area_name,(ar.id IS NOT NULL AND ar.city_id=CAST(a.city_id AS UNSIGNED)) AS location_matches,
        v.values_json
      FROM ads a
      LEFT JOIN categories c ON c.id=a.category_id
      LEFT JOIN sub_categories s ON s.id=a.subcategory_id
      LEFT JOIN cities ci ON ci.id=a.city_id
      LEFT JOIN areas ar ON ar.id=a.area_id
      LEFT JOIN ad_category_values v ON v.ad_id=a.id AND v.subcategory_id=a.subcategory_id
      ORDER BY a.id DESC`,
  ]);
  const definitions=new Map(cfg.subcategories.map(item=>[item.id,item]));
  const reviewRows=rawRows.flatMap(row=>{
    const definition=row.subcategory_id===null?undefined:definitions.get(row.subcategory_id);
    const source:EditorReviewSource={
      id:Number(row.id),title:row.title||'',categoryName:row.category_name,categoryActive:row.category_active==='yes',
      subcategoryName:row.subcategory_name,subcategoryActive:row.subcategory_active===1,
      subcategoryParentMatches:row.subcategory_parent_id!==null&&row.subcategory_parent_id===Number(row.category_id),
      templateKey:definition?.templateKey,values:values(row.values_json),knownFieldKeys:definition?.fields.map(field=>field.key)||[],
      cityName:row.city_name,areaName:row.area_name,locationMatches:Boolean(row.location_matches),
    };
    const review=buildEditorReviewRow(source);return review?[review]:[];
  });
  const page=Math.max(1,Number.parseInt(pageRaw||'1',10)||1),pages=Math.max(1,Math.ceil(reviewRows.length/PAGE_SIZE));
  const current=Math.min(page,pages),shown=reviewRows.slice((current-1)*PAGE_SIZE,current*PAGE_SIZE);
  const taxonomyCount=reviewRows.filter(row=>row.reasons.some(reason=>reason.includes('قسم')||reason.includes('تصنيف')||reason.includes('معدة'))).length;
  const legacyCount=reviewRows.filter(row=>row.legacyFieldKeys.length>0).length;
  const geoCount=reviewRows.filter(row=>row.locationStatus==='excluded_from_nearby').length;
  return <div dir="rtl" className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-xl font-extrabold text-primary">مراجعة جودة الإعلانات</h1><p className="mt-1 text-sm text-muted-foreground">قائمة قراءة فقط. لا تغيّر القسم أو بيانات الإعلان تلقائيًا، والبيانات القديمة تبقى محفوظة مع حجب غير الموثوق منها عن العرض العام.</p></div><Link href="/admin/ads" className="rounded-lg border px-3 py-2 text-sm font-bold text-primary">العودة للإعلانات</Link></div>
    <div className="grid gap-2 sm:grid-cols-4">
      {[['بانتظار مراجعة بشرية',reviewRows.length,'bg-amber-50 text-amber-900'],['مشكلات تصنيف',taxonomyCount,'bg-red-50 text-red-900'],['حقول قديمة محجوبة',legacyCount,'bg-slate-50 text-slate-800'],['مستبعدة من القريب',geoCount,'bg-blue-50 text-blue-900']].map(([label,count,style])=><div key={String(label)} className={`rounded-xl border p-3 ${style}`}><div className="text-2xl font-extrabold">{String(count)}</div><div className="text-xs font-bold">{label}</div></div>)}
    </div>
    <div className="overflow-x-auto rounded-2xl border bg-white p-2 shadow-sm">
      <table className="w-full min-w-[1050px] text-right text-sm"><thead><tr className="border-b bg-secondary/40"><th className="p-2">الإعلان</th><th className="p-2">التصنيف الحالي</th><th className="p-2">سبب المراجعة</th><th className="p-2">الاقتراح</th><th className="p-2">الحقول القديمة</th><th className="p-2">الموقع</th></tr></thead><tbody>
        {shown.map(row=><tr key={row.adId} className="border-b align-top last:border-0"><td className="p-2"><Link href={`/ads/${row.adId}`} className="font-bold text-primary hover:underline">#{row.adId} — {row.title||'بلا عنوان'}</Link></td><td className="p-2">{row.currentCategory}<span className="block text-xs text-muted-foreground">{row.currentSubcategory}</span></td><td className="p-2"><ul className="list-inside list-disc space-y-1">{row.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></td><td className="p-2 text-muted-foreground">لا يوجد اقتراح قطعي؛ يحتاج محررًا</td><td className="p-2 font-mono text-xs">{row.legacyFieldKeys.join('، ')||'—'}</td><td className="p-2">{row.locationStatus==='valid'?'صالح':'مستبعد من نتائج القريب'}</td></tr>)}
        {!shown.length&&<tr><td colSpan={6} className="p-8 text-center text-emerald-700">لا توجد سجلات تحتاج مراجعة.</td></tr>}
      </tbody></table>
    </div>
    <div className="flex items-center justify-between text-sm"><span>صفحة {current} من {pages}</span><div className="flex gap-2">{current>1&&<Link className="rounded border px-3 py-1" href={`?page=${current-1}`}>السابق</Link>}{current<pages&&<Link className="rounded border px-3 py-1" href={`?page=${current+1}`}>التالي</Link>}</div></div>
  </div>;
}
