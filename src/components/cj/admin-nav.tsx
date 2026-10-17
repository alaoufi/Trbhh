'use client';
import Link from 'next/link';
import {useAdminNavigationAccess} from '@/components/admin-navigation-access';
import {ADMIN_GROUPS} from '@/components/admin-nav-def';
type Current='purchases'|'preparation'|'tracking'|'history'|'browse'|'imported'|'showcase'|'orders'|'payables'|'agents'|'glossary'|'settings';
export function CjAdminNav({current}:{current:Current}){
 const allowed=new Set(useAdminNavigationAccess());
 const items=ADMIN_GROUPS.find(g=>g.key==='cj')?.items.filter(i=>allowed.has(i.href))||[];
 const href=current==='settings'?'/admin/suppliers/cj':'/admin/suppliers/cj/'+current;
 return <nav aria-label="فهرس المورد CJ" className="grid gap-3 border-b border-primary/15 pb-3 sm:grid-cols-2 xl:grid-cols-3">
 {[...new Set(items.map(i=>i.section))].map(section=><section key={section} className="min-w-0"><h3 className="mb-1 text-xs font-bold text-muted-foreground">{section}</h3><div className="flex flex-wrap gap-1">{items.filter(i=>i.section===section).map(i=><Link key={i.href} href={i.href} aria-current={href===i.href?'page':undefined} className={'min-h-9 rounded-lg px-2 py-1.5 text-sm font-bold '+(href===i.href?'bg-primary text-white':'border border-primary/25 text-primary hover:bg-primary/5')}>{i.label}</Link>)}</div></section>)}
 </nav>;
}
