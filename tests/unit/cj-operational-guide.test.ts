import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import {CjOperationalGuide} from '@/components/cj/operational-guide';
it('explains financial proof and manual escalation without offering any financial control',()=>{const html=renderToStaticMarkup(createElement(CjOperationalGuide));for(const text of ['لا تكرر الدفع','Billing History','الاسترداد','مسح استلام','48 ساعة','رسوم إضافية'])expect(html).toContain(text);expect(html).not.toMatch(/<form|<input|<button/);});
