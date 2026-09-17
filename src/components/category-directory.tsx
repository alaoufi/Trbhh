import Link from 'next/link';
import catalog from '@/domain/category-catalog.json';
import { categoriesOn, categoryOptions, categoryLabels } from '@/lib/categories-v2';
export async function CategoryDirectory() {
  if (!(await categoriesOn())) return null;
  const [categories,labels]=await Promise.all([categoryOptions(),categoryLabels()]);
  return <section aria-labelledby="categories-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 id="categories-title" className="text-2xl font-extrabold text-[#16294A]">{labels.title}</h2><p className="mt-2 text-sm leading-7 text-slate-600">{labels.intro}</p></div><Link href="/search" className="rounded-full bg-[#16294A] px-4 py-2 text-sm text-white">جميع الإعلانات ←</Link></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{categories.filter(c=>c.active).map(c=><Link key={c.id} href={`/categories/${c.id}`} className="group flex min-h-32 flex-col rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:-translate-y-1 hover:border-[#F0B429] hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-amber-500"><span aria-hidden className="mb-3 text-3xl">{catalog.find(x=>x.name===c.name)?.icon||'📁'}</span><span className="font-bold text-[#16294A]">{c.name}</span><span className="mt-2 text-xs leading-5 text-slate-500">{c.branches.filter(s=>s.active).slice(0,3).map(s=>s.name).join(' · ')}</span></Link>)}</div>
  </section>;
}
