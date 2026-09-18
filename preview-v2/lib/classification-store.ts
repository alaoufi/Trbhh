'use client';
import {useEffect,useState} from 'react';
import {listings,type Listing} from './demo-data';
import {assign,classify,validTarget,CLASSIFICATION_KEY,type Target} from './classification';
import {readLocal} from './preview';
export type Assignment=Target & {fromCategory?:string;fromSubcategory?:string;fromRevision?:string;updatedAt?:number};
export type Assignments=Record<string,Assignment>;
export const CLASSIFICATION_EVENT='trbhh-classification-updated';
export function readAssignments():Assignments {
  const value=readLocal<Assignments>(CLASSIFICATION_KEY,{});
  return value && typeof value==='object' && !Array.isArray(value) ? value : {};
}
export function resolveAd<T extends {id:string;title:string;category?:string;subcategory?:string;details?:unknown;classificationArchive?:unknown[];classificationRevision?:string}>(ad:T,source:'market'|'local',overrides:Assignments) {
  const override=Object.hasOwn(overrides,`${source}:${ad.id}`)?overrides[`${source}:${ad.id}`]:undefined;
  // A later edit to the source's category takes precedence over a stale bulk assignment.
  if(validTarget(override) && ad.category===override.fromCategory && ad.subcategory===override.fromSubcategory && ad.classificationRevision===override.fromRevision) {
    return {...assign([ad],[ad.id],override)[0],category:override.category,subcategory:override.subcategory,classificationSource:'manual',classificationReview:override.category==='أخرى' && override.subcategory==='أخرى'};
  }
  const result=classify(ad);
  return {...ad,category:result.category,subcategory:result.subcategory,classificationReview:result.review,classificationSource:result.source};
}
export function useMarketListings() {
  const [overrides,setOverrides]=useState<Assignments>({});
  useEffect(()=>{
    const update=()=>setOverrides(readAssignments());
    update();window.addEventListener('storage',update);window.addEventListener(CLASSIFICATION_EVENT,update);
    return()=>{window.removeEventListener('storage',update);window.removeEventListener(CLASSIFICATION_EVENT,update);};
  },[]);
  return listings.map(ad=>resolveAd(ad,'market',overrides)) as (Listing & {subcategory:string;classificationReview:boolean})[];
}
