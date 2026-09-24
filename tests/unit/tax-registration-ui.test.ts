import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {calculateTaxRegistration} from '@/lib/finance/tax-registration';
import {TaxRegistrationMonitor} from '@/components/finance/tax-registration-monitor';
const now=new Date('2026-09-24T12:00:00Z');
describe('tax registration monitor coverage and accessible warnings',()=>{
 it('shows source-qualified totals, threshold, rolling dates and updated time without a VAT activation action',()=>{
  const report=calculateTaxRegistration({now,events:[{sourceKey:'one',origin:'invoice',kind:'supply',classification:'zero',netMinor:37500000,at:now.toISOString()}],gaps:[]});
  const html=renderToStaticMarkup(createElement(TaxRegistrationMonitor,{report}));
  expect(html).toContain('التوريدات المؤكدة');expect(html).toContain('375,000.00');expect(html).toContain('آخر تحديث');expect(html).toContain('لا تُفعّل الضريبة تلقائيًا');expect(html).toContain('role="alert"');expect(html).toContain('الأشهر الاثنا عشر المكتملة');
  expect(html).not.toMatch(/<form|<button|action=/);expect(html).not.toContain('مسجل تلقائيًا');
 });
 it('renders quantified missing sources and insufficient forecast instead of a safe green zero',()=>{
  const report=calculateTaxRegistration({now,events:[],gaps:[{code:'pending',label:'طلبات مدفوعة بانتظار الإصدار',count:2,amountMinor:20000}]});
  const html=renderToStaticMarkup(createElement(TaxRegistrationMonitor,{report}));
  expect(html).toContain('التغطية غير مكتملة');expect(html).toContain('ليس إجمالي المنشأة النهائي');expect(html).toContain('طلبات مدفوعة بانتظار الإصدار');expect(html).toContain('200.00');expect(html).toContain('التوقع غير متاح');expect(html).not.toContain('الوضع آمن');
 });
});
