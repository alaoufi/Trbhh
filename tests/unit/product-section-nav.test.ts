import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {ProductSectionNav} from '@/components/product-section-nav';
describe('native product detail section navigation',()=>{
 it('links only explicit section anchors without hiding content or creating controls',()=>{const html=renderToStaticMarkup(createElement(ProductSectionNav,{items:[{id:'cj-buy',label:'خيارات الشراء'},{id:'cj-description',label:'التفاصيل'}]}));expect(html).toContain('href="#cj-buy"');expect(html).toContain('href="#cj-description"');expect(html).toContain('aria-label="أقسام المنتج"');expect(html).not.toMatch(/role="tab"|<button|<form/);});
 it('rejects unsafe IDs and empty labels, removes duplicate targets',()=>{const html=renderToStaticMarkup(createElement(ProductSectionNav,{items:[{id:'javascript:alert(1)',label:'bad'},{id:'valid',label:''},{id:'specs',label:'مواصفات'},{id:'specs',label:'مكرر'}]}));expect(html).not.toContain('javascript');expect(html.match(/href=/g)).toHaveLength(1);});
 it('does not render an empty navigation landmark',()=>{expect(renderToStaticMarkup(createElement(ProductSectionNav,{items:[]}))).toBe('');});
});
