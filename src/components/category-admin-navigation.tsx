import Link from 'next/link';
import {CATEGORY_ADMIN_PAGES,type CategoryAdminView} from '@/lib/ad-categories/admin-navigation';
export function CategoryAdminNavigation({home=false,current}:{home?:boolean;current?:CategoryAdminView}){
  return <nav aria-label="الأقسام وإدارتها" className="grid min-w-0 gap-2 sm:grid-cols-2">
    {!home&&<Link href="/admin/categories" className="min-h-11 rounded-xl border px-3 py-3 text-sm sm:col-span-2">العودة إلى مركز الأقسام وإدارتها</Link>}
    {Object.entries(CATEGORY_ADMIN_PAGES).map(([key,item])=><Link key={key} href={`/admin/categories/${key}`} aria-current={current===key?'page':undefined} className={`min-h-11 min-w-0 break-words rounded-xl border p-3 ${current===key?'border-primary bg-primary text-white':'bg-white hover:border-primary'}`}><span className="block font-bold">{item.title}</span>{home&&<span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>}</Link>)}
  </nav>;
}
