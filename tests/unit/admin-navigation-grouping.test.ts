import {expect,it} from 'vitest';
import {ADMIN_GROUPS,ADMIN_NAV} from '@/components/admin-nav-def';
it('indexes each destination once and keeps all CJ pages under one parent',()=>{
 expect(new Set(ADMIN_NAV.map(i=>i.href)).size).toBe(ADMIN_NAV.length);
 const cj=ADMIN_GROUPS.find(g=>g.key==='cj')!;
 expect(cj.items.length).toBeGreaterThan(10);
 expect(cj.items.some(i=>i.href.endsWith('/payables'))).toBe(true);
 expect(cj.items.every(i=>Boolean(i.section))).toBe(true);
 expect(ADMIN_GROUPS.filter(g=>g.key!=='cj').flatMap(g=>g.items).some(i=>i.href.startsWith('/admin/suppliers/cj'))).toBe(false);
});
it('collects finance destinations without expanding permission definitions',()=>{
 const finance=ADMIN_GROUPS.find(g=>g.key==='finance-accounting')!;
 expect(finance.items.some(i=>i.href==='/admin/commerce/accounts')).toBe(true);
 expect(ADMIN_NAV.filter(i=>i.href.startsWith('/admin/finance')||i.href.startsWith('/admin/revenue')).every(i=>finance.items.some(f=>f.href===i.href))).toBe(true);
});
