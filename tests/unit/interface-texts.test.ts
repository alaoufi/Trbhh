import {expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {InterfaceTextsProvider,InterfaceText,ConfiguredPriceLabel} from '@/components/interface-texts';
import {defaultInterfaceTexts,parseInterfaceTexts,interfaceTextChanges} from '@/lib/interface-texts';
import {adPriceLabel} from '@/lib/ad-presentation';
vi.stubGlobal('React',React);
it('applies the admin bidding label without changing pricing semantics',()=>{
 const labels=parseInterfaceTexts('{"bidding":"قابل للتفاوض"}');
 expect(adPriceLabel({price:0,priceType:'som'},labels)).toBe('قابل للتفاوض');
 expect(adPriceLabel({price:120,priceType:'sale'},labels)).toBe(adPriceLabel({price:120,priceType:'sale'}));
 expect(adPriceLabel({price:0,priceType:'som',priceEnabled:false},labels)).toBe('');
});
it('falls back for corrupt, blank or unknown values and excludes private settings',()=>{
 expect(parseInterfaceTexts('invalid')).toEqual(defaultInterfaceTexts);
 expect(parseInterfaceTexts('{"bidding":" ","secret":"private"}')).toEqual(defaultInterfaceTexts);
});
it('preserves omitted fields and validates the entire update before saving',()=>{
 const form=new FormData();form.set('ui_adData','بيانات الإعلان');
 expect(interfaceTextChanges(form,defaultInterfaceTexts)).toEqual({...defaultInterfaceTexts,adData:'بيانات الإعلان'});
 form.set('ui_bidding','x'.repeat(501));expect(()=>interfaceTextChanges(form,defaultInterfaceTexts)).toThrow();
});
it('renders configured labels in server HTML and escapes administrator text',()=>{
 const texts={...defaultInterfaceTexts,bidding:'قابل للتفاوض',adData:'بيانات الإعلان <script>alert(1)</script>'};
 const html=renderToStaticMarkup(React.createElement(InterfaceTextsProvider,{texts},React.createElement(React.Fragment,null,
   React.createElement(ConfiguredPriceLabel,{label:adPriceLabel({price:0,priceType:'som'})}),
   React.createElement(InterfaceText,{name:'adData'})
 )));
 expect(html).toContain('قابل للتفاوض');expect(html).toContain('بيانات الإعلان');expect(html).not.toContain('<script>');
});
