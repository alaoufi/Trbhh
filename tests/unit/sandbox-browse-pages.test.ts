import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
const data=vi.hoisted(()=>({getFeaturedAds:vi.fn(),getHomeLatestAds:vi.fn(),getMostViewedAds:vi.fn(),getTopRatedAds:vi.fn(),getStats:vi.fn(),getPersonalizedAds:vi.fn(),getCities:vi.fn(),getAreas:vi.fn(),countSearchAds:vi.fn(),searchAds:vi.fn(),promoteScheduledAds:vi.fn()}));
vi.mock('@/lib/data',()=>data);
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>undefined})}));
vi.mock('@/lib/settings',()=>({getHomeStats:async()=>new Set(),getHomeClassifiedText:async()=>({}),getHomeHeadings:async()=>({latest:'أحدث الإعلانات'}),getSettingBool:async()=>true,getSetting:async(_key:string,fallback:string)=>fallback,getWelcomePopupSeconds:async()=>0,SETTING_WELCOME_GUEST_TEXT:'text',DEFAULT_WELCOME_GUEST_TEXT:'',getFeedBannerItems:async()=>[]}));
vi.mock('@/lib/auth',()=>({getSession:async()=>null}));
vi.mock('@/lib/merchant',()=>({homeFeaturedAds:async()=>[],homeStoreCards:async()=>[],storeIdOfUser:async()=>0}));
vi.mock('@/lib/points',()=>({getWelcomeCredit:async()=>0}));
vi.mock('@/lib/platform-rating',()=>({getPlatformRating:async()=>({avg:0,count:0}),getMyPlatformReview:async()=>null}));
vi.mock('@/lib/saved-search',()=>({listSavedSearches:async()=>[],savedSearchEnabled:async()=>false}));
vi.mock('@/app/search/actions',()=>({saveSearchAction:vi.fn(),deleteSavedSearchAction:vi.fn()}));
vi.mock('@/components/promo-slot',()=>({PromoSlot:()=>null}));
vi.mock('@/components/ad-card',()=>({AdGrid:()=>null}));
vi.mock('@/components/store-mini-card',()=>({StoreMiniCard:()=>null}));
vi.mock('@/components/open-store-banner',()=>({OpenStoreBanner:()=>null}));
vi.mock('@/components/topup-promo-banner',()=>({TopupPromoBanner:()=>null}));
vi.mock('@/components/public-search-form',()=>({PublicSearchForm:()=>null}));
import HomePage from '@/app/page';
import SearchPage from '@/app/search/page';
import {PublicSearchForm} from '@/components/public-search-form';
import {AdminPager} from '@/components/admin-pager';
import {sandboxCatalogOptions} from '@/lib/sandbox-catalog';
import * as searchFilters from '@/lib/search-filters';
function propsFor(node:ReactNode,type:unknown):Record<string,unknown>[] {
  if(Array.isArray(node))return node.flatMap(child=>propsFor(child,type));
  if(!isValidElement<{children?:ReactNode}>(node))return [];
  return [...(node.type===type?[node.props]:[]),...propsFor(node.props.children,type)];
}
beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv('PREVIEW_SANDBOX','true');
  for(const name of ['getFeaturedAds','getHomeLatestAds','getMostViewedAds','getTopRatedAds','getPersonalizedAds','searchAds'] as const)data[name].mockResolvedValue([]);
  data.getStats.mockResolvedValue({ads:120,users:0,views:0});data.countSearchAds.mockResolvedValue(120);
  data.getCities.mockResolvedValue([{id:1,name:'الرياض',countryId:1}]);data.getAreas.mockResolvedValue([{id:2,name:'الخرج',cityId:1}]);
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
const filters={category:'أخرى',subcategory:'أخرى',q:'كتاب',city:'1',area:'2',type:'offer',minPrice:'10',sort:'price_asc',page:'2'};
describe('sandbox browse routes',()=>{
  it.each([true,false].flatMap(sandbox=>['home','search'].flatMap(route=>['q','category','page'].map(key=>({sandbox,route,key})))))(
    'rejects repeated $key in $route with sandbox=$sandbox',async({sandbox,route,key})=>{
      vi.stubEnv('PREVIEW_SANDBOX',String(sandbox));
      const normalize=vi.spyOn(searchFilters,'normalizeSearchParams');
      const input={...filters,[key]:[filters[key as keyof typeof filters],filters[key as keyof typeof filters]]};
      const result=await (route==='home'?HomePage:SearchPage)({searchParams:Promise.resolve(input)});
      if(route==='home'&&!sandbox) {
        expect(normalize).not.toHaveBeenCalled();expect(data.searchAds).not.toHaveBeenCalled();
        expect(data.getHomeLatestAds).toHaveBeenCalledWith(8);
      } else {
        const query=data.searchAds.mock.calls[0][0];
        if(key==='q')expect(query.q).toBeUndefined();
        if(key==='category') {expect(query.category).toBeUndefined();expect(query.subcategory).toBeUndefined();}
        expect(query.skip).toBe(key==='page'?0:route==='home'?24:48);
        expect(propsFor(result,AdminPager)[0].page).toBe(key==='page'?1:2);
      }
    });
  it('retains valid string filters in production search',async()=>{
    vi.stubEnv('PREVIEW_SANDBOX','false');
    await SearchPage({searchParams:Promise.resolve(filters)});
    expect(data.searchAds).toHaveBeenCalledWith(expect.objectContaining({q:'كتاب',cityId:1,areaId:2,sort:'price_asc',take:48,skip:48}));
  });
  it('home pages the full public query at 24 and preserves filters in its form and pager',async()=>{
    const page=await HomePage({searchParams:Promise.resolve(filters)});
    expect(data.getHomeLatestAds).not.toHaveBeenCalled();
    expect(data.searchAds).toHaveBeenCalledWith(expect.objectContaining({category:'أخرى',subcategory:'أخرى',q:'كتاب',cityId:1,areaId:2,type:'offer',minPrice:10,sort:'price_asc',take:24,skip:24}));
    expect(propsFor(page,PublicSearchForm)[0]).toMatchObject({action:'/',categories:sandboxCatalogOptions,params:{category:'أخرى',subcategory:'أخرى'}});
    expect(propsFor(page,AdminPager)[0]).toMatchObject({basePath:'/',page:2,pages:5,total:120,params:{category:'أخرى',subcategory:'أخرى',q:'كتاب',city:'1',area:'2',sort:'price_asc'}});
  });
  it('search preserves the selected catalog pair and existing filters across 48-item pages',async()=>{
    const page=await SearchPage({searchParams:Promise.resolve(filters)});
    expect(data.searchAds).toHaveBeenCalledWith(expect.objectContaining({category:'أخرى',subcategory:'أخرى',take:48,skip:48}));
    expect(propsFor(page,PublicSearchForm)[0]).toMatchObject({categories:sandboxCatalogOptions,params:{category:'أخرى',subcategory:'أخرى'}});
    expect(propsFor(page,AdminPager)[0]).toMatchObject({params:{category:'أخرى',subcategory:'أخرى',city:'1',area:'2'}});
  });
  it('clamps the home page and invalid URL category names without losing honest zero results',async()=>{
    data.countSearchAds.mockResolvedValue(0);
    const page=await HomePage({searchParams:Promise.resolve({category:'constructor',subcategory:'toString',page:'999'})});
    const query=data.searchAds.mock.calls[0]?.[0];
    expect(query).toMatchObject({take:24,skip:0});expect(query.category).toBeUndefined();
    expect(propsFor(page,AdminPager)[0]).toMatchObject({page:1,pages:1,total:0});
  });
  it('production keeps eight latest ads and no catalog dropdowns or home search paging',async()=>{
    vi.stubEnv('PREVIEW_SANDBOX','false');
    const home=await HomePage({searchParams:Promise.resolve(filters)});
    expect(data.getHomeLatestAds).toHaveBeenCalledWith(8);expect(data.searchAds).not.toHaveBeenCalled();
    expect(propsFor(home,AdminPager)).toEqual([]);expect(propsFor(home,PublicSearchForm)[0].categories).toBeUndefined();
    const search=await SearchPage({searchParams:Promise.resolve(filters)});
    expect(data.searchAds.mock.calls[0][0].category).toBeUndefined();
    expect(propsFor(search,PublicSearchForm)[0].categories).toBeUndefined();
  });
});
