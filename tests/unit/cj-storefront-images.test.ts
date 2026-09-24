import {describe,expect,it,vi} from 'vitest';

vi.mock('@/lib/prisma',()=>({prisma:{}}));
vi.mock('@/lib/settings',()=>({getSetting:vi.fn(),setSetting:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:vi.fn()}));
vi.mock('@/lib/access-control/guards',()=>({hasAccess:vi.fn()}));

import {cjProductImages,importedToAdCard,cjImg} from '@/lib/cj/storefront';
import type {CjProductRow} from '@/lib/cj/mapping';

const primary='https://cf.cjdropshipping.com/quick/product/primary.jpg';
const variant='https://oss-cf.cjdropshipping.com/product/variant.jpeg';
const other='https://cf.cjdropshipping.com/quick/product/other.jpg';

describe('CJ same-product display images',()=>{
  it('keeps the saved primary before this product gallery and removes whitespace duplicates',()=>{
    expect(cjProductImages({image:` ${primary} `,images:JSON.stringify([variant,primary,` ${variant} `,other])}))
      .toEqual([primary,variant,other]);
  });
  it('uses the saved gallery when the primary is empty without inventing a placeholder',()=>{
    expect(cjProductImages({image:'',images:JSON.stringify([variant,other])})).toEqual([variant,other]);
    expect(cjProductImages({image:'',images:null})).toEqual([]);
  });
  it.each(['javascript:alert(1)','data:image/png;base64,AAAA','/relative.jpg','not a URL','https://user:password@cf.cjdropshipping.com/image.jpg'])('ignores an invalid primary %s and keeps valid same-product gallery images',image=>{
    expect(cjProductImages({image,images:JSON.stringify([null,12,{},'',image,variant])})).toEqual([variant]);
  });
  it('retains a valid primary when the gallery JSON is malformed',()=>{
    expect(cjProductImages({image:primary,images:'{broken'})).toEqual([primary]);
  });
  it('never reuses an image from a previous product',()=>{
    expect(cjProductImages({image:primary,images:null})).toEqual([primary]);
    expect(cjProductImages({image:'',images:null})).toEqual([]);
    expect(cjProductImages({image:other,images:JSON.stringify([variant])})).toEqual([other,variant]);
  });
  it('maps a gallery-only card through the same primary-image selection and CJ proxy',()=>{
    const row={id:7,image:'',images:JSON.stringify([variant]),name:'Fixture',name_ar:'سلعة',sale_price_minor:1000,sale_price_override_minor:null} as CjProductRow;
    expect(importedToAdCard(row).image).toBe(cjImg(cjProductImages(row)[0]));
    expect(importedToAdCard(row).image).toBe(`/api/cj/img?u=${encodeURIComponent(variant)}`);
  });
});
