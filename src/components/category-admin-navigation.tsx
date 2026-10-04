import Link from 'next/link';
import {CATEGORY_ADMIN_PAGES,type CategoryAdminView} from '@/lib/ad-categories/admin-navigation';
export function CategoryAdminNavigation({home=false,current}:{home?:boolean;current?:CategoryAdminView}){
  const links=<nav aria-label="الأقسام وحقولها" className="grid min-w-0 gap-2 sm:grid-cols-2">
    {Object.entries(CATEGORY_ADMIN_PAGES).map(([key,item])=><Link key={key} href={`/admin/categories/${key}`} aria-current={current===key?'page':undefined} className={`min-h-11 min-w-0 break-words rounded-xl border p-3 ${current===key?'border-primary bg-primary text-white':'bg-white hover:border-primary'}`}><span className="block font-bold">{item.title}</span>{home&&<span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>}</Link>)}
  </nav>;
  return <div className="space-y-2"><Link href="/admin/help" className="inline-block min-h-11 rounded-lg border px-3 py-2 text-sm font-bold text-primary">مساعدة الأقسام: الدليل والشرح واللقطات</Link>{home?links:<details className="min-w-0 rounded-xl border p-2"><summary className="min-h-11 cursor-pointer px-2 py-3 text-sm font-medium">انتقل إلى صفحة أخرى</summary>{links}</details>}</div>;
}
