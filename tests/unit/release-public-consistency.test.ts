import {expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
const state=vi.hoisted(()=>({stores:[{id:1,name:'متجر الاختبار',logo:'/placeholder-ad.svg',address:'الرياض',trusted:true}],count:vi.fn(async()=>0)}));
vi.mock('@/lib/stores',()=>({getStores:async()=>state.stores}));
vi.mock('@/lib/settings',()=>({getEmptyText:async()=>'لا توجد متاجر معتمدة بعد.'}));
vi.mock('@/lib/data',()=>({getCities:async()=>[{id:1,name:'الرياض',countryId:1}],getAreas:async()=>[],countSearchAds:state.count,searchAds:async()=>[]}));
import CompaniesPage from '@/app/companies/page';
import NearbyPage from '@/app/nearby/page';
import StaticPage from '@/app/pages/[slug]/page';
import {Footer} from '@/components/footer';

it('renders the directory source without an extra conflicting approval filter',async()=>{
  const html=renderToStaticMarkup(await CompaniesPage());
  expect(html).toContain('/companies/1');
  expect(html).toContain('متجر الاختبار');
  expect(html).not.toContain('لا توجد متاجر معتمدة');
});
it('does not infer a region from an account or ask the visitor to sign in',async()=>{
  state.count.mockClear();
  const html=renderToStaticMarkup(await NearbyPage({searchParams:Promise.resolve({})}));
  expect(state.count).not.toHaveBeenCalled();
  expect(html).not.toContain('وسجّل الدخول');
  expect(html).toContain('لا يلزم تسجيل الدخول');
  await NearbyPage({searchParams:Promise.resolve({city:'1'})});
  expect(state.count).toHaveBeenCalledWith({cityId:1,areaId:undefined,geoTrustedOnly:true});
});
it('explains visitor session storage separately from saved advertisement location',async()=>{
  const html=renderToStaticMarkup(await StaticPage({params:Promise.resolve({slug:'privacy'})}));
  for(const text of ['لا نطلب إذن GPS عند فتح الموقع','sessionStorage','دون حفظها في قاعدة بيانات الحساب','تُحفظ الإحداثيات مع الإعلان','Google Maps'])expect(html).toContain(text);
});
it('explains optional GPS in FAQ and renders the current copyright year',async()=>{
  const html=renderToStaticMarkup(await StaticPage({params:Promise.resolve({slug:'faq'})}));
  expect(html).toContain('الموقع الجغرافي GPS اختياري');
  expect(html).toContain('لا يمنع رفض الإذن نشر الإعلان');
  const footer=renderToStaticMarkup(createElement(Footer));
  expect(footer).toContain(String(new Date().getFullYear()));
  expect(footer).not.toContain('© 2015');
  expect(footer).toContain('منصة إعلانية مميزة');
});
