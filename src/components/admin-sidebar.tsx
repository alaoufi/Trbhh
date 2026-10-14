'use client';
import Link from 'next/link';
import {usePathname,useSearchParams} from 'next/navigation';
import {ChevronDown,Home} from 'lucide-react';
import {ADMIN_GROUPS} from '@/components/admin-nav-def';
import {resolveAdminPageTitle} from '@/lib/admin-page-title';
export function AdminSidebar({allowedHrefs,roles}:{allowedHrefs:string[];roles:{id:string;name:string}[]}){
 const pathname=usePathname(),search=useSearchParams(),allowed=new Set(allowedHrefs);
 const groups=ADMIN_GROUPS.map(group=>({...group,items:group.items.filter(item=>allowed.has(item.href))})).filter(group=>group.items.length);
 const active=resolveAdminPageTitle(groups.flatMap(group=>group.items),pathname,search.toString());
 // Keep the current department and page visible without duplicating their links.
 groups.sort((a,b)=>Number(b.items.some(item=>item.href===active?.href))-Number(a.items.some(item=>item.href===active?.href)));
 return <aside id="admin-nav" className="hidden h-fit card-3d rounded-xl p-3 md:block">
  <div className="mb-3 border-b pb-3"><div className="text-base font-extrabold text-primary">لوحة التحكم</div><div className="mt-2 flex flex-wrap gap-1">{roles.map(role=><span key={role.id} className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">{role.name}</span>)}</div></div>
  <nav aria-label="قائمة الإدارة" className="space-y-1.5">{groups.map(group=>{
   const current=group.items.some(item=>item.href===active?.href);
   const entries=[...group.items].sort((a,b)=>Number(b.href===active?.href)-Number(a.href===active?.href));
   return <details key={`${group.key}:${active?.href??''}`} open={current} className="overflow-hidden rounded-lg border" style={{borderColor:`${group.color}40`}}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-extrabold text-white" style={{background:group.color}}><span className="flex items-center gap-2"><group.icon className="h-4 w-4"/>{group.title}</span><ChevronDown className="h-4 w-4 opacity-80"/></summary>
    <div className="space-y-0.5 p-1" style={{background:`${group.color}0d`}}>{entries.map(({href,label,icon:Icon})=><Link key={href} href={`${href}#admin-content`} aria-current={href===active?.href?'page':undefined} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold hover:bg-white/70 ${href===active?.href?'bg-white shadow-sm ring-1 ring-current':''}`} style={{color:group.color}}><Icon className="h-4 w-4"/>{label}</Link>)}</div>
   </details>;
  })}<Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-secondary"><Home className="h-4 w-4"/>العودة للموقع</Link></nav>
 </aside>;
}
