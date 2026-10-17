import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AdminNavigationAccess} from '@/components/admin-navigation-access';
import {CjAdminNav} from '@/components/cj/admin-nav';
it('shows only server-approved CJ links with the matching title',()=>{const html=renderToStaticMarkup(createElement(AdminNavigationAccess,{hrefs:['/admin/suppliers/cj/tracking']},createElement(CjAdminNav,{current:'tracking'})));expect(html).toContain('شحن المورد والتتبع والاستلام');expect(html).toContain('aria-current="page"');expect(html).not.toContain('/payables');expect(html).not.toContain('/purchases');});
it('fails closed without an authorized navigation provider',()=>{const html=renderToStaticMarkup(createElement(CjAdminNav,{current:'tracking'}));expect(html).not.toContain('<a ');});
