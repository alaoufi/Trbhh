import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const url=new URL('../lib/price-label.ts',import.meta.url);const api=existsSync(url)?await import(url.href):{};
test('public prices preserve rental periods and zero-price semantics',()=>{
 assert.equal(typeof api.publicPriceLabel,'function');
 for(const [rentPeriod,label] of [['بالساعة','ساعة'],['يومي','يوم'],['أسبوعي','أسبوع'],['شهري','شهر'],['سنوي','سنة'],[null,'تأجير']])assert.equal(api.publicPriceLabel({price:9500,priceType:'rent',rentPeriod}),`9,500 ر.س / ${label}`);
 assert.equal(api.publicPriceLabel({price:0,priceType:'som'}),'على السوم');
 assert.equal(api.publicPriceLabel({price:0,priceType:'negotiable'}),'السعر قابل للتفاوض');
 assert.equal(api.publicPriceLabel({price:0,intent:'wanted'}),'الميزانية غير محددة');
 assert.equal(api.publicPriceLabel({price:0}),'السعر غير محدد');
 assert.equal(api.publicPriceLabel({price:9500,priceType:'sale'}),'9,500 ر.س');
});
