'use client';
import {usePathname,useSearchParams} from 'next/navigation';
import {resolveAdminPageTitle} from '@/lib/admin-page-title';
export function AdminPageHeading({items}:{items:{href:string;label:string}[]}){
 const pathname=usePathname(),search=useSearchParams();
 const page=resolveAdminPageTitle(items,pathname,search.toString());
 if(!page)return null;
 return <header className="mb-4 border-b border-primary/15 pb-3"><h1 className="text-xl font-extrabold text-primary" dir="rtl">{page.label}</h1></header>;
}
