'use strict';
// Read-only, narrowly scoped evidence. Never print credentials, contacts, balances or ad content.
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient({log:[]});
const print=(label,value)=>console.log(label,JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v));
(async()=>{
 const names=['ابو ماجد 1','ابو ماجد 2','أبو ماجد 1','أبو ماجد 2'];
 const profiles=await db.profiles.findMany({where:{name:{in:names}},select:{id:true,user_id:true,name:true,type:true,is_default:true,store_id:true}});
 print('MATCHED_PROFILES',profiles);
 const ids=[...new Set(profiles.map(p=>String(p.user_id)))].map(BigInt);
 if(ids.length){
  print('ACCOUNT_STATE',await db.users.findMany({where:{id:{in:ids}},select:{id:true,archived_at:true,ban:true,ban_until:true,merged_into:true}}));
  print('RECENT_AD_STATE',await db.ads.findMany({where:{user_id:{in:ids}},orderBy:{id:'desc'},take:12,select:{id:true,user_id:true,profile_id:true,status:true,state:true,store_only:true,trbhh_until:true,publish_at:true,data_archive:true,created_at:true,category_id:true,subcategory_id:true}}));
 }
 print('VISIBILITY_POLICY',await db.$queryRawUnsafe("SELECT k,v FROM site_settings WHERE k IN ('platform_ad_lifecycle_enabled','platform_ad_member_free_daily_limit','platform_ad_member_free_days','ads_require_approval','commerce_purchasing_enabled')"));
 print('LIVE_ORDERS_DISABLED',process.env.SUPPLIER_ALLOW_LIVE_ORDERS==='false');
})().catch(()=>{console.error('READ_ONLY_AD_DIAGNOSIS_FAILED');process.exitCode=1}).finally(()=>db.$disconnect());
