import React from 'react';
import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CjAdminPriceBreakdown} from '@/components/cj/admin-price-breakdown';
it('shows supplier cost, actual markup, shipping and customer total without marking up freight',()=>{const html=renderToStaticMarkup(React.createElement(CjAdminPriceBreakdown,{supplierMinor:3334,saleMinor:4335,otherCostsMinor:0,shippingMinor:4845}));for(const value of ['قيمة السلعة في CJ','هامش ربح تربح','الشحن','الإجمالي','33.34','10.01','48.45','91.80'])expect(html).toContain(value);});
it('separates other configured costs from profit',()=>{const html=renderToStaticMarkup(React.createElement(CjAdminPriceBreakdown,{supplierMinor:2000,saleMinor:2860,otherCostsMinor:200,shippingMinor:1000}));expect(html).toContain('6.60');expect(html).toContain('تكاليف إضافية');expect(html).toContain('38.60');});
it('does not invent profit for inconsistent amounts',()=>{expect(renderToStaticMarkup(React.createElement(CjAdminPriceBreakdown,{supplierMinor:2000,saleMinor:1000,otherCostsMinor:0,shippingMinor:1000}))).toContain('تعذر تأكيد تفصيل السعر');});
