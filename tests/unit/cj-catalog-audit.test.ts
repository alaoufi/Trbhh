import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const {compareVariants,auditProduct,unwrap}=createRequire(import.meta.url)('../../scripts/diagnostics/cj-catalog-audit.cjs');
const saved={vid:'vid1',sku:'SKU1',name:'White',optionKey:'White',priceUsd:1,weight:20};
const live={vid:'vid1',variantSku:'SKU1',variantNameEn:'White',variantKey:'White',variantSellPrice:1,variantWeight:20};
describe('readonly complete imported catalog audit',()=>{
 it('detects changed prices, missing variants and duplicate identities',()=>{
  expect(compareVariants([saved],[live])).toEqual([]);
  expect(compareVariants([saved],[{...live,variantSellPrice:2}])).toContainEqual({vid:'vid1',issue:'price_changed'});
  expect(compareVariants([saved],[])).toContainEqual({vid:'vid1',issue:'variant_missing_at_cj'});
  expect(compareVariants([saved],[live,live])).toContainEqual({issue:'live_vid_invalid_or_duplicate'});
 });
 it('checks every variant and quotes the supplied postcode using read endpoints only',async()=>{
  const calls:unknown[]=[];
  const row={id:302n,cj_product_id:'pid',name:'Clip',name_ar:'مشبك',display_description_ar:'وصف عربي',details_json:{variants:[saved]}};
  const api=async(endpoint:string,method:string,body:unknown)=>{calls.push({endpoint,method,body});if(endpoint==='/product/query')return {pid:'pid',productNameEn:'Clip',variants:[live]};if(endpoint==='/product/stock/getInventoryByPid')return {variantInventories:[{vid:'vid1',inventory:[{countryCode:'CN',totalInventory:10}]}]};if(endpoint==='/logistic/freightCalculate')return [{logisticName:'route',logisticPrice:5}];throw Error('unexpected');};
  const report=await auditProduct(row,api,'15365');expect(report.issues).toEqual([]);expect(report.observations).toEqual([{vid:'vid1',stock:10,shippingRoutes:1}]);
  expect(calls).toContainEqual({endpoint:'/logistic/freightCalculate',method:'POST',body:{startCountryCode:'CN',endCountryCode:'SA',zip:'15365',products:[{vid:'vid1',quantity:1}]}});
 });
 it('does not treat absent stock data as out of stock or skip failed products silently',async()=>{
  const row={id:1,cj_product_id:'p',name:'n',name_ar:'اسم',display_description_ar:'وصف',details_json:{variants:[saved]}};
  const r=await auditProduct(row,async(path:string)=>path==='/product/query'?{pid:'p',productNameEn:'n',variants:[live]}:{variantInventories:[]},'15365');expect(r.issues).toContainEqual({vid:'vid1',issue:'inventory_unverified'});
 });
 it('stops on CJ quota errors even when HTTP succeeds',()=>{expect(()=>unwrap({code:1600200,result:false})).toThrow('cj_quota_or_auth_stop');});
 it('contains no database writes, order endpoints, token refresh or secret logging',()=>{
  const code=fs.readFileSync('scripts/diagnostics/cj-catalog-audit.cjs','utf8');
  expect(code).not.toMatch(/\$executeRaw|\.upsert\(|(?:prisma|db)\.update\(|\/shopping\/order\/|getAccessToken|refreshAccessToken|console\.log\(token/);
 });
});
