import {describe,it,expect} from 'vitest';
import {resolveAdminPageTitle} from '@/lib/admin-page-title';
const pages=[{href:'/admin',label:'Home'},{href:'/admin/suppliers/cj',label:'Settings'},{href:'/admin/suppliers/cj/payables',label:'Payables'},{href:'/admin/finance',label:'Finance'},{href:'/admin/finance?section=tax',label:'Tax'}];
describe('shared administrative page names',()=>{
 it('uses the most specific sidebar entry on detail pages',()=>{expect(resolveAdminPageTitle(pages,'/admin/suppliers/cj/payables/7','')?.label).toBe('Payables');});
 it('matches query sections without depending on query order',()=>{expect(resolveAdminPageTitle(pages,'/admin/finance','message=saved&section=tax')?.label).toBe('Tax');});
 it('keeps the base title for other sections',()=>{expect(resolveAdminPageTitle(pages,'/admin/finance','section=unknown')?.label).toBe('Finance');});
 it('does not label an unknown route as the home page',()=>{expect(resolveAdminPageTitle(pages,'/admin/unknown','')).toBeNull();});
});
