import Link from 'next/link';
import { notFound } from 'next/navigation';
import { categoriesOn, categoryOptions } from '@/lib/categories-v2';
import { searchAds, countSearchAds } from '@/lib/data';
import { AdGrid } from '@/components/ad-card';
import { AdminPager } from '@/components/admin-pager';
export const dynamic='force-dynamic';
export default async function CategoryPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{branch?:string;page?:string}>}) {
  if(!(await categoriesOn())) notFound();
  const {id}=await params, sp=await searchParams;
  const cat=(await categoryOptions()).find(c=>c.id===Number(id));
  if(!cat) notFound();
  const branch=cat.branches.find(s=>s.id===Number(sp.branch));
  const query={categoryId:cat.id,subcategoryId:branch?.id};
  const total=await countSearchAds(query),pages=Math.max(1,Math.ceil(total/24));
  const page=Math.min(pages,Math.max(1,Number.parseInt(sp.page||'1')||1));
  const ads=await searchAds({...query,take:24,skip:(page-1)*24});
  return <div className="space-y-6"><Link href="/categories" className="text-sm text-primary">الأقسام ←</Link><section className="rounded-3xl bg-[#16294A] p-6 text-white"><h1 className="text-3xl font-extrabold">{cat.name}</h1><p className="mt-3 text-white/80">{total} إعلان{branch?` · ${branch.name}`:''}</p><div className="mt-5 flex flex-wrap gap-2"><Link className="rounded-full bg-white px-4 py-2 text-sm text-slate-900" href={`/categories/${id}`}>الكل</Link>{cat.branches.map(s=><Link key={s.id} className={`rounded-full px-4 py-2 text-sm ${branch?.id===s.id?'bg-[#F0B429] text-slate-900':'bg-white/15'}`} href={`/categories/${id}?branch=${s.id}`}>{s.name}</Link>)}</div></section><div className="flex flex-wrap gap-3"><Link className="rounded-xl bg-primary px-4 py-3 text-white" href="/ads/new">أضف إعلانك</Link><Link className="rounded-xl border px-4 py-3" href={`/search?category=${id}`}>بحث متقدم في القسم</Link></div>{ads.length?<AdGrid ads={ads}/>:<p className="rounded-2xl border border-dashed p-10 text-center text-slate-500">لا توجد إعلانات في هذا الاختيار حالياً.</p>}<AdminPager basePath={`/categories/${id}`} page={page} pages={pages} total={total} params={{branch:branch?String(branch.id):undefined}}/></div>;
}
