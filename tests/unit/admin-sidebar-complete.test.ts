import {beforeEach,describe,it,expect,vi} from 'vitest';
import {readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ADMIN_NAV,ADMIN_GROUPS} from '@/components/admin-nav-def';
import {resolveAdminPageTitle} from '@/lib/admin-page-title';
import {canAccessPage,pagePermission} from '@/lib/access-control/catalog';
const current=vi.hoisted(()=>({path:'/admin/suppliers/cj/orders',search:''}));
vi.mock('next/navigation',()=>({usePathname:()=>current.path,useSearchParams:()=>new URLSearchParams(current.search)}));
import {AdminSidebar} from '@/components/admin-sidebar';
import {AdminPageHeading} from '@/components/admin-page-heading';
beforeEach(()=>{current.path='/admin/suppliers/cj/orders';current.search='';});
function pages(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?pages(join(dir,entry.name)):entry.name==='page.tsx'?[join(dir,entry.name)]:[]);}
describe('complete admin sidebar matching',()=>{
 it('registers each sidebar destination once',()=>{expect(new Set(ADMIN_NAV.map(item=>item.href)).size).toBe(ADMIN_NAV.length);});
 it('registers CJ pages that were silently omitted from permission grouping',()=>{for(const route of ['imported','glossary','orders','orders/new','payables'])expect(ADMIN_NAV.some(item=>item.href===`/admin/suppliers/cj/${route}`)).toBe(true);expect(pagePermission('/admin/suppliers/cj/orders/new')).toBe('orders:create');expect(canAccessPage(new Set(['orders:view']),'/admin/suppliers/cj/orders/new')).toBe(false);});
 it('gives every non-redirect admin page a matching visible sidebar destination',()=>{
  const base=join(process.cwd(),'src/app/admin'),redirects=new Set(['/admin/roles','/admin/moderation','/admin/packages','/admin/promos/packages']);
  const routes=pages(base).map(file=>'/admin/'+relative(base,file).replace(/\\/g,'/').replace(/(?:^|\/)page.tsx$/,'').replace(/\[[^/]+\]/g,'1')).map(route=>route.replace(/\/$/,''));
  expect(routes.length).toBeGreaterThan(0);
  for(const route of routes.filter(route=>!redirects.has(route))){expect(pagePermission(route),route).toBeTruthy();expect(resolveAdminPageTitle(ADMIN_NAV,route,''),route).toBeTruthy();}
 });
 it('keeps navigation positions stable while highlighting and opening the current page',()=>{
  const html=renderToStaticMarkup(createElement(AdminSidebar,{allowedHrefs:ADMIN_NAV.map(item=>item.href),roles:[]}));
  expect(html).toContain('aria-current="page"');expect(html).toMatch(/<details[^>]*open=""/);
  expect(html.indexOf('/admin#admin-content')).toBeLessThan(html.indexOf('/admin/suppliers/cj/orders#admin-content'));
  expect(html.match(/href="\/admin\/suppliers\/cj\/orders#admin-content"/g)).toHaveLength(1);
 });
 it('separates category management, suppliers and the CJ lifecycle without changing permissions',()=>{
  expect(ADMIN_GROUPS.find(g=>g.items.some(i=>i.href==='/admin/categories'))?.key).toBe('market-categories');
  expect(ADMIN_GROUPS.find(g=>g.items.some(i=>i.href==='/admin/suppliers'))?.key).toBe('supplier-management');
  expect(ADMIN_GROUPS.find(g=>g.items.some(i=>i.href==='/admin/suppliers/cj/browse'))?.key).toBe('cj');
  expect(ADMIN_GROUPS.find(g=>g.items.some(i=>i.href==='/admin/suppliers/cj/payables'))?.key).toBe('cj');
  expect(pagePermission('/admin/categories')).toBe('categories:view');
 });
 it('uses exactly the same label in heading and active sidebar link for every registered destination',()=>{
  for(const entry of ADMIN_NAV){[current.path,current.search='']=entry.href.split('?');const html=renderToStaticMarkup(createElement(AdminSidebar,{allowedHrefs:ADMIN_NAV.map(item=>item.href),roles:[]}));const heading=renderToStaticMarkup(createElement(AdminPageHeading,{items:ADMIN_NAV.map(({href,label})=>({href,label}))}));const active=html.match(/<a\b[^>]*aria-current="page"[^>]*>([\s\S]*?)<\/a>/)?.[1];expect(active,entry.href).toContain(entry.label);expect(heading,entry.href).toContain(entry.label);}
 });
 it('never adds inaccessible destinations when prioritizing a department',()=>{const html=renderToStaticMarkup(createElement(AdminSidebar,{allowedHrefs:['/admin/users'],roles:[]}));expect(html).not.toContain('مستحقات CJ');expect(html).not.toContain('طلبات CJ');});
});
