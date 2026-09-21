import {beforeEach,expect,it,vi} from 'vitest';
import {isValidElement,type ReactElement} from 'react';
import {CATEGORY_LABELS} from '@/lib/ad-categories/contracts';
const state=vi.hoisted(()=>({enabled:true,search:vi.fn(),featured:vi.fn(),latest:vi.fn(),personalized:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>undefined})}));
vi.mock('@/lib/auth',()=>({getSession:async()=>({uid:1})}));
vi.mock('@/lib/ad-categories/service',()=>({getCategoryFormConfig:async()=>({enabled:state.enabled,labels:CATEGORY_LABELS,categories:[{id:90,name:'Other',active:true,order:0},{id:91,name:'Hidden',active:false,order:1}],subcategories:[]})}));
vi.mock('@/lib/data',()=>({
 getFeaturedAds:state.featured,getHomeLatestAds:state.latest,searchAds:state.search,getPersonalizedAds:state.personalized,
 getMostViewedAds:async()=>[],getTopRatedAds:async()=>[],getStats:async()=>({ads:0,users:0,views:0}),getCities:async()=>[],getAreas:async()=>[],promoteScheduledAds:async()=>{},
}));
vi.mock('@/lib/settings',()=>({getHomeStats:async()=>new Set(),getHomeClassifiedText:async()=>({title:'',sub:''}),getSettingBool:async()=>false,getSetting:async(_k:string,v:string)=>v,getWelcomePopupSeconds:async()=>0,getFeedBannerItems:async()=>[],SETTING_WELCOME_GUEST_TEXT:'welcome',DEFAULT_WELCOME_GUEST_TEXT:''}));
vi.mock('@/lib/merchant',()=>({homeFeaturedAds:async()=>[{id:30}],homeStoreCards:async()=>[],storeIdOfUser:async()=>1}));
vi.mock('@/lib/platform-rating',()=>({getPlatformRating:async()=>({avg:0,count:0}),getMyPlatformReview:async()=>null}));
// Only inspect the real page's composition; child components are not executed.
vi.mock('@/components/ad-card',()=>({AdGrid:()=>null}));
vi.mock('@/components/public-search-form',()=>({PublicSearchForm:()=>null}));
vi.mock('@/components/promo-slot',()=>({PromoSlot:()=>null}));
vi.mock('@/components/platform-rating-widget',()=>({PlatformRatingWidget:()=>null}));
import HomePage from '@/app/page';
import {AdGrid} from '@/components/ad-card';
import {PublicSearchForm} from '@/components/public-search-form';
import {CommerceHero} from '@/components/commerce/commerce-hero';
import {NationalDayBanner,NationalDayHeroFrame} from '@/components/national-day-banner';
function elements(value:unknown):ReactElement<Record<string,unknown>>[]{
 if(Array.isArray(value))return value.flatMap(elements);
 if(!isValidElement<Record<string,unknown>>(value))return [];
 return [value,...elements(value.props.children)];
}
beforeEach(()=>{vi.clearAllMocks();state.enabled=true;state.featured.mockResolvedValue([{id:2}]);state.latest.mockResolvedValue([{id:3},{id:2}]);state.personalized.mockResolvedValue([{id:40}]);state.search.mockResolvedValue([{id:90},{id:89}]);});
it('renders only bounded category results in one grid, preserves query order and search link',async()=>{
 const tree=elements(await HomePage({searchParams:Promise.resolve({category:'90'})}));
 const grids=tree.filter(e=>e.type===AdGrid);
 expect(grids).toHaveLength(1);expect(grids[0].props.ads).toEqual([{id:90},{id:89}]);
 expect(state.search).toHaveBeenCalledWith({categoryId:90,take:24,skip:0});
 expect(state.featured).not.toHaveBeenCalled();expect(state.latest).not.toHaveBeenCalled();expect(state.personalized).not.toHaveBeenCalled();
 expect(tree.some(e=>e.props.href==='/search?category=90')).toBe(true);
});
it.each(['91','999',undefined])('uses default feed for invalid selection %s',async category=>{
 const tree=elements(await HomePage({searchParams:Promise.resolve({category})}));
 expect(tree.find(e=>e.type===AdGrid)?.props.ads).toEqual([{id:2},{id:3},{id:30}]);expect(state.search).not.toHaveBeenCalled();
});
it('uses default feed when categories are disabled',async()=>{
 state.enabled=false;
 const tree=elements(await HomePage({searchParams:Promise.resolve({category:'90'})}));
 expect(tree.find(e=>e.type===AdGrid)?.props.ads).toEqual([{id:2},{id:3},{id:30}]);expect(state.search).not.toHaveBeenCalled();
});
it('does not fall back to unrelated ads for an empty active category',async()=>{
 state.search.mockResolvedValue([]);
 const tree=elements(await HomePage({searchParams:Promise.resolve({category:'90'})}));
 expect(tree.filter(e=>e.type===AdGrid)).toHaveLength(0);
 expect(tree.some(e=>e.props.children===CATEGORY_LABELS.emptyText)).toBe(true);
});
it('retains only the validated category in the homepage search form',async()=>{
 // Enable the discovery section without changing other setting behavior.
 const settings=await import('@/lib/settings');
 const flag=vi.spyOn(settings,'getSettingBool').mockImplementation(async key=>key==='home_discovery_on');
 try {
  const selected=elements(await HomePage({searchParams:Promise.resolve({category:'90'})}));
  expect(selected.find(e=>e.type===PublicSearchForm)?.props.params).toEqual({category:'90'});
  const invalid=elements(await HomePage({searchParams:Promise.resolve({category:'91'})}));
  expect(invalid.find(e=>e.type===PublicSearchForm)?.props.params).toEqual({category:undefined});
 } finally {flag.mockRestore();}
});
it('renders the approved presentation at the public root while retaining the same feed',async()=>{
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-09-23T12:00:00+03:00'));
 const settings=await import('@/lib/settings');
 const flag=vi.spyOn(settings,'getSettingBool').mockImplementation(async key=>key==='home_discovery_on');
 try {
  const tree=elements(await HomePage({searchParams:Promise.resolve({})}));
  expect(tree.some(e=>e.props['data-home-version']==='marketplace-v2')).toBe(true);
  const hero=tree.find(e=>e.type===CommerceHero);
  expect(hero?.props.headingLevel).toBe(1);
  expect(hero?.props.slides).toEqual([
   expect.objectContaining({id:'national-leadership',href:null,cta:'',presentation:'separated'}),
   expect.objectContaining({id:'national-flag',href:null,cta:'',presentation:'separated'}),
  ]);
  expect(hero?.props.intervalMs).toBe(10000);
  expect(tree.find(e=>e.type===AdGrid)?.props).toMatchObject({appearance:'marketplace',ads:[{id:2},{id:3},{id:30}]});
 } finally {flag.mockRestore();clock.mockRestore();}
});
it.each([
 ['2026-09-20T20:59:59.999Z',false],
 ['2026-09-20T21:00:00.000Z',true],
 ['2026-09-24T21:00:00.000Z',false],
])('applies and expires the public-home seasonal treatment without replacing the feed at %s',async(timestamp,active)=>{
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(timestamp));
 const settings=await import('@/lib/settings');
 const flag=vi.spyOn(settings,'getSettingBool').mockImplementation(async key=>key==='home_discovery_on');
 try {
  const tree=elements(await HomePage({searchParams:Promise.resolve({})}));
  expect(tree[0].props['data-home-campaign']).toBe(active?'saudi-national-day-2026':undefined);
  expect(tree.some(e=>e.type===NationalDayBanner)).toBe(active);
  expect(tree.find(e=>e.type===NationalDayHeroFrame)?.props.active).toBe(active);
  expect(tree.some(e=>typeof e.type==='function'&&e.type.name==='NationalDayEntry')).toBe(active);
  expect(tree.find(e=>e.type===AdGrid)?.props.ads).toEqual([{id:2},{id:3},{id:30}]);
  const hero=tree.find(e=>e.type===CommerceHero);
  expect(hero?.props.compact).toBe(true);
  if(active) expect(hero?.props.slides).toEqual([
   expect.objectContaining({id:'national-leadership',image:'/national-day/leadership.webp',href:null,cta:''}),
   expect.objectContaining({id:'national-flag',image:'/national-day/saudi-flag.svg',href:null,cta:''}),
  ]);
  else expect(hero?.props.slides).toEqual(expect.arrayContaining([expect.objectContaining({title:'بيع. اشترِ. وتربح.',href:'/search'})]));
 } finally {flag.mockRestore();clock.mockRestore();}
});
it('keeps category results and their browse target during the seasonal treatment',async()=>{
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-09-23T12:00:00+03:00'));
 const settings=await import('@/lib/settings');
 const flag=vi.spyOn(settings,'getSettingBool').mockImplementation(async key=>key==='home_discovery_on');
 try {
  const tree=elements(await HomePage({searchParams:Promise.resolve({category:'90'})}));
  expect(tree.some(e=>e.type===NationalDayBanner)).toBe(true);
  expect(tree.find(e=>e.type===AdGrid)?.props.ads).toEqual([{id:90},{id:89}]);
  expect(tree.find(e=>e.type===CommerceHero)?.props.slides).toEqual([
   expect.objectContaining({id:'national-leadership',href:null,cta:''}),
   expect.objectContaining({id:'national-flag',href:null,cta:''}),
  ]);
  expect(state.search).toHaveBeenCalledWith({categoryId:90,take:24,skip:0});
 } finally {flag.mockRestore();clock.mockRestore();}
});
