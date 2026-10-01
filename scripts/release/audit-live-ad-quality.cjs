'use strict';

const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {PrismaClient}=require('@prisma/client');

const WRITE_GRANT=/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|TRIGGER|EXECUTE|FILE|PROCESS|SUPER|RELOAD|SHUTDOWN|GRANT OPTION)\b/i;
const classificationRank={AUTO_FIX_SAFE:1,NEEDS_REVIEW:2,INVALID_BUT_PRESERVE:3};
const impactRank={EDITORIAL_ONLY:1,SAFE_LEGACY:2,NEEDS_EDITOR_REVIEW:3,BLOCKING_PUBLIC:4};

function json(value,fallback){
  if(value===null||value===undefined)return fallback;
  if(typeof value==='string'){try{return JSON.parse(value);}catch{return fallback;}}
  return value;
}
function number(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function normalize(value){return String(value||'').normalize('NFKC').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,'').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/\s+/g,' ').trim().toLowerCase();}
function pathKey(category,subcategory){return `${normalize(category)}\u0000${normalize(subcategory)}`;}
function definitionFields(raw){const parsed=json(raw,[]);return Array.isArray(parsed)?parsed:Array.isArray(parsed?.fields)?parsed.fields:[];}
function matchesStep(value,field){if(!(field.step>0))return true;const q=(value-number(field.min))/number(field.step);return Math.abs(q-Math.round(q))<=1e-8;}
function add(issues,code,classification,impact,detail={}){issues.push({code,classification,impact,...detail});}
function isActiveRow(row){const state=String(row.state??'');return Number(row.status)===1&&(state==='1'||state==='active');}

function classifySubcategoryReason(row){
  if(!row.subcategory_id)return 'subcategory_missing';
  if(!row.subcategory_exists)return 'subcategory_not_found';
  if(!row.subcategory_active||row.category_active==='no')return 'legacy_id';
  if(row.leaf_semantically_valid===false&&row.subcategory_matches)return 'ad_points_to_wrong_leaf';
  if(!row.subcategory_matches){
    if(number(row.duplicate_category_count)>1)return 'duplicate_category';
    if(row.category_remap_target_id)return 'category_remapped';
    return 'parent_child_mismatch';
  }
  return 'other';
}

function publicFieldTrust(row){
  const title=normalize(row.title),template=row.template_key||'',values=json(row.values_json,{});
  const has=(parts)=>parts.some(part=>title.includes(part));
  if(['sanitary','legacy_building_tools'].includes(template)&&has(['مقاول','مقاولات','تركيب شبوك','تركيب شبك','اعمال نخيل','تنسيق حدائق','صيانه']))return {trusted:false,reason:'service_in_goods_leaf'};
  if(template==='lifting'){
    const selected=normalize(values?.equipment_kind);
    const expected=has(['سيزر لفت','سيزرلفت','رافعة مقصيه','منصه مقصيه'])?'رافعة مقصية':has(['رافعة شوكي','فوركلفت','فورك لفت'])?'رافعة شوكية':has(['تلسكوبي','تلسكوبيه','تلي هاندلر'])?'مناولة تلسكوبية':'';
    if(expected&&selected!==normalize(expected))return {trusted:false,reason:'lifting_kind_conflict'};
  }
  return {trusted:true};
}

function auditRow(row){
  const issues=[];
  if(!row.category_exists)add(issues,'invalid_category','INVALID_BUT_PRESERVE','NEEDS_EDITOR_REVIEW',{reviewDisposition:'NEEDS_EDITOR_REVIEW',publicTaxonomySuppressed:true});
  const subcategoryReason=classifySubcategoryReason(row);
  if(subcategoryReason!=='other')add(issues,'invalid_subcategory',subcategoryReason==='category_remapped'?'AUTO_FIX_SAFE':'INVALID_BUT_PRESERVE','NEEDS_EDITOR_REVIEW',{reason:subcategoryReason,publicTaxonomySuppressed:true,...(subcategoryReason==='category_remapped'?{}:{reviewDisposition:'NEEDS_EDITOR_REVIEW'})});
  if(!row.city_id||!row.area_id||!row.location_matches)add(issues,'missing_or_mismatched_location','NEEDS_REVIEW','SAFE_LEGACY',{reason:!row.city_id||!row.area_id?'missing_location':'location_mismatch',excludedFromGeo:true});
  const price=number(row.price),oldPrice=number(row.old_price);
  if(price<0)add(issues,'invalid_price','INVALID_BUT_PRESERVE','BLOCKING_PUBLIC',{fieldKey:'price'});
  if(oldPrice<0||(oldPrice>0&&oldPrice<=price))add(issues,'invalid_old_price','INVALID_BUT_PRESERVE','SAFE_LEGACY',{fieldKey:'old_price',publicDiscountSuppressed:true});
  if(price>0&&oldPrice>price&&Math.round((oldPrice-price)*100/oldPrice)>=80)add(issues,'suspicious_discount','NEEDS_REVIEW','EDITORIAL_ONLY',{discountPercent:Math.round((oldPrice-price)*100/oldPrice)});
  const temporal=Boolean(row.rent_period)||row.price_type==='rent';
  if((row.sale_type==='sale'&&temporal)||(row.sale_type==='rent'&&!temporal))add(issues,'listing_price_mismatch','NEEDS_REVIEW','BLOCKING_PUBLIC');
  const fields=definitionFields(row.effective_fields_json??row.fields_json),values=json(row.values_json,{}),known=new Map(fields.map(field=>[field.key,field]));
  if(values&&typeof values==='object'&&!Array.isArray(values))for(const [key,value] of Object.entries(values)){
    const field=known.get(key);
    if(!field){add(issues,'field_not_in_category','INVALID_BUT_PRESERVE','SAFE_LEGACY',{fieldKey:key,publiclySuppressed:true});continue;}
    if(['number','decimal','year'].includes(field.type)){
      const n=Number(value);
      if(!Number.isFinite(n)||(field.min!==undefined&&n<number(field.min))||(field.max!==undefined&&n>number(field.max))||!matchesStep(n,field))add(issues,'impossible_field_range','INVALID_BUT_PRESERVE','SAFE_LEGACY',{fieldKey:key,value,publiclySuppressed:true});
    }
    if(field.unit&&typeof field.unit!=='string')add(issues,'invalid_unit','INVALID_BUT_PRESERVE','SAFE_LEGACY',{fieldKey:key,publiclySuppressed:true});
  }
  const trust=publicFieldTrust(row);
  if(!trust.trusted)add(issues,'wrong_leaf_semantic','NEEDS_REVIEW','NEEDS_EDITOR_REVIEW',{reason:'ad_points_to_wrong_leaf',reviewDisposition:'NEEDS_EDITOR_REVIEW',publicFieldsSuppressed:true,publicTaxonomySuppressed:true,trustReason:trust.reason});
  if(row.subcategory_id&&!row.values_json)add(issues,'legacy_values_not_migrated','NEEDS_REVIEW','EDITORIAL_ONLY');
  return issues;
}

function summarize(rows,duplicates){
  const summary={records:rows.length,clean:0,AUTO_FIX_SAFE:0,NEEDS_REVIEW:0,INVALID_BUT_PRESERVE:0,needsEditorReview:0,issues:{},impacts:{BLOCKING_PUBLIC:0,SAFE_LEGACY:0,EDITORIAL_ONLY:0,NEEDS_EDITOR_REVIEW:0},subcategoryReasons:{},locationReasons:{missing_location:0,location_mismatch:0},legacyFields:{invalidHidden:0,invalidVisible:0,unitMismatches:0,rangeViolations:0},duplicateCandidates:duplicates.length};
  const records=[];
  for(const row of rows){
    const issues=auditRow(row);
    if(!issues.length){summary.clean++;continue;}
    const kinds=new Set(issues.map(issue=>issue.classification));for(const kind of kinds)summary[kind]++;
    for(const issue of issues){
      summary.issues[issue.code]=(summary.issues[issue.code]||0)+1;
      if(['field_not_in_category','impossible_field_range','invalid_unit'].includes(issue.code)){
        if(issue.publiclySuppressed)summary.legacyFields.invalidHidden++;else summary.legacyFields.invalidVisible++;
        if(issue.code==='invalid_unit')summary.legacyFields.unitMismatches++;
        if(issue.code==='impossible_field_range')summary.legacyFields.rangeViolations++;
      }
      if(issue.code==='invalid_subcategory'&&issue.reason)summary.subcategoryReasons[issue.reason]=(summary.subcategoryReasons[issue.reason]||0)+1;
      if(issue.code==='missing_or_mismatched_location'&&issue.reason)summary.locationReasons[issue.reason]=(summary.locationReasons[issue.reason]||0)+1;
    }
    if(issues.some(issue=>issue.reviewDisposition==='NEEDS_EDITOR_REVIEW'))summary.needsEditorReview++;
    const impact=issues.map(issue=>issue.impact).sort((a,b)=>impactRank[b]-impactRank[a])[0];summary.impacts[impact]++;
    records.push({id:String(row.id),classification:issues.reduce((best,issue)=>classificationRank[issue.classification]>classificationRank[best]?issue.classification:best,'AUTO_FIX_SAFE'),impact,issues});
  }
  return {generatedAt:new Date().toISOString(),readOnly:true,summary,records,duplicateCandidates:duplicates.map(row=>({normalizedTitle:row.normalized_title,count:Number(row.count),ids:String(row.ids).split(',')}))};
}

function searchVisibilityBreakdown(rows,{plans,subscriptions,now}){
  const activePlans=plans.filter(plan=>Number(plan.active??1)===1);
  const defaultPlan=activePlans.find(plan=>Number(plan.is_default)===1)||activePlans.find(plan=>number(plan.price)===0)||{id:0,ad_days:0};
  const planById=new Map(activePlans.map(plan=>[Number(plan.id),plan]));
  const subByUser=new Map(subscriptions.filter(sub=>!sub.expires_at||new Date(sub.expires_at)>now).map(sub=>[Number(sub.user_id),planById.get(Number(sub.package_id))]));
  const excluded={banned_seller:0,package_age:0};let visible=0;
  for(const row of rows){
    if(row.ban==='checked'){excluded.banned_seller++;continue;}
    const promoted=(row.adsSpecial==='checked'&&row.expires_at&&new Date(row.expires_at)>now)||(row.urgent_until&&new Date(row.urgent_until)>now)||!row.created_at;
    const plan=subByUser.get(Number(row.user_id))||defaultPlan,days=number(plan?.ad_days);
    if(!promoted&&days>0&&new Date(row.created_at)<new Date(now.getTime()-days*86400000)){excluded.package_age++;continue;}
    visible++;
  }
  return {activeBase:rows.length,searchVisible:visible,excluded};
}

function buildCountAlignment(rows,{plans,subscriptions,now}){
  return {
    previewRuntime:searchVisibilityBreakdown(rows,{plans:[],subscriptions:[],now}),
    configuredPackagePolicySimulation:searchVisibilityBreakdown(rows,{plans,subscriptions,now}),
  };
}

function buildResolutionSummary(summary){
  const reasons=summary.subcategoryReasons||{};
  return {
    before:Object.values(reasons).reduce((total,value)=>total+number(value),0),
    autoFixCandidates:number(reasons.category_remapped),
    autoFixed:0,
    needsEditorReview:number(summary.needsEditorReview),
    remainingBlocking:number(summary.impacts?.BLOCKING_PUBLIC),
  };
}

function buildSchemaReport(rows,manifest){
  const templates=new Map((manifest.templates||[]).map(template=>[pathKey(template.categoryName,template.name),template]));
  const reviews=new Map((manifest.qualityReviews||[]).map(review=>[review.key,review]));
  const sourceCounts={DB:0,code_template:0,inherited:0,fallback:0};
  const reportRows=rows.map(row=>{
    const template=templates.get(pathKey(row.category_name,row.subcategory_name));
    const dbFields=definitionFields(row.fields_json),source=dbFields.length?'DB':template?'code_template':'fallback';
    sourceCounts[source]++;
    const fields=source==='DB'?dbFields:(template?.fields||[]),review=template?reviews.get(template.key):undefined;
    return {leafKey:template?.key||`db-${row.subcategory_id}`,categoryPath:`${row.category_name} / ${row.subcategory_name}`,source,fieldCount:fields.length,requiredCount:fields.filter(field=>field.required).length,conditionalCount:fields.filter(field=>field.dependsOn).length,qualityStatus:review?.status||(source==='fallback'?'NEEDS_FIELD_CHANGE':'NEEDS_EDITOR_REVIEW'),qualityReason:review?.reason||(source==='fallback'?'لا يوجد تعريف DB ولا قالب كود مطابق؛ الورقة غير صالحة للعرض العام حتى إنشاء Schema متخصص.':'تعريف DB مخصص يحتاج إثبات مراجعة تحريرية مستقلة.')};
  });
  return {sourceCounts,rows:reportRows};
}

async function main(){
  const db=new PrismaClient();
  try{
    const grants=await db.$queryRawUnsafe('SHOW GRANTS FOR CURRENT_USER()');
    const grantText=grants.flatMap(row=>Object.values(row).map(String)).join(' ');
    if(!/\bSELECT\b/i.test(grantText)||WRITE_GRANT.test(grantText))throw new Error('audit_requires_read_only_database_user');
    const manifest=json(readFileSync(resolve(__dirname,'category-seeds.json'),'utf8'),{templates:[],qualityReviews:[]});
    const templateByPath=new Map((manifest.templates||[]).map(template=>[pathKey(template.categoryName,template.name),template]));
    const rows=await db.$queryRawUnsafe(`
      SELECT a.id,a.title,a.category_id,a.subcategory_id,a.city_id,a.area_id,a.price,a.old_price,a.sale_type,a.price_type,a.rent_period,
        a.user_id,a.created_at,a.adsSpecial,a.expires_at,a.urgent_until,a.status,a.state,a.store_only,a.trbhh_until,u.ban,
        (c.id IS NOT NULL) AS category_exists,c.is_active AS category_active,c.name AS category_name,
        (s.id IS NOT NULL) AS subcategory_exists,s.active AS subcategory_active,s.category_id AS subcategory_parent_id,s.name AS subcategory_name,
        (s.id IS NOT NULL AND s.category_id=CAST(a.category_id AS UNSIGNED)) AS subcategory_matches,
        (SELECT COUNT(*) FROM categories dc WHERE TRIM(dc.name)=TRIM(c.name)) AS duplicate_category_count,
        (ar.id IS NOT NULL AND ar.city_id=CAST(a.city_id AS UNSIGNED)) AS location_matches,
        pc.name AS subcategory_parent_name,d.fields_json,v.values_json
      FROM ads a
      LEFT JOIN users u ON u.id=a.user_id
      LEFT JOIN categories c ON c.id=a.category_id
      LEFT JOIN sub_categories s ON s.id=a.subcategory_id
      LEFT JOIN categories pc ON pc.id=s.category_id
      LEFT JOIN areas ar ON ar.id=a.area_id
      LEFT JOIN ad_category_definitions d ON d.subcategory_id=a.subcategory_id
      LEFT JOIN ad_category_values v ON v.ad_id=a.id AND v.subcategory_id=a.subcategory_id
      ORDER BY a.id`);
    for(const row of rows){
      const template=templateByPath.get(pathKey(row.subcategory_parent_name||row.category_name,row.subcategory_name));
      row.template_key=template?.key;row.effective_fields_json=row.fields_json||template?.fields||[];
      row.leaf_semantically_valid=publicFieldTrust(row).trusted;
    }
    const duplicates=await db.$queryRawUnsafe(`SELECT LOWER(TRIM(title)) AS normalized_title,COUNT(*) AS count,GROUP_CONCAT(id ORDER BY id) AS ids FROM ads WHERE TRIM(title)<>'' GROUP BY LOWER(TRIM(title)) HAVING COUNT(*)>1 ORDER BY count DESC LIMIT 200`);
    const [mainCategories,subcategories,leafDefinitions,leafRows,settings,plans,subscriptions]=await Promise.all([
      db.$queryRawUnsafe("SELECT COUNT(*) AS count FROM categories WHERE is_active='yes'"),
      db.$queryRawUnsafe('SELECT COUNT(*) AS count FROM sub_categories WHERE active=1'),
      db.$queryRawUnsafe('SELECT COUNT(*) AS count FROM ad_category_definitions d JOIN sub_categories s ON s.id=d.subcategory_id WHERE s.active=1'),
      db.$queryRawUnsafe("SELECT s.id AS subcategory_id,s.name AS subcategory_name,c.name AS category_name,d.fields_json FROM sub_categories s JOIN categories c ON c.id=s.category_id LEFT JOIN ad_category_definitions d ON d.subcategory_id=s.id WHERE s.active=1 AND c.is_active='yes' ORDER BY c.ordered,c.id,s.`order`,s.id"),
      db.$queryRawUnsafe("SELECT k,v FROM site_settings WHERE k='platform_ad_lifecycle_enabled'"),
      db.$queryRawUnsafe('SELECT id,price,ad_days,is_default,active FROM packages'),
      db.$queryRawUnsafe('SELECT user_id,package_id,expires_at FROM user_packages'),
    ]);
    const lifecycleEnabled=String(settings[0]?.v||'0')==='1',now=new Date();
    const activeBase=rows.filter(row=>isActiveRow(row)&&(lifecycleEnabled?(row.trbhh_until&&new Date(row.trbhh_until)>now):(Number(row.store_only)===0||(row.trbhh_until&&new Date(row.trbhh_until)>now))));
    const report=summarize(rows,duplicates);
    report.publicSummary=summarize(activeBase,duplicates).summary;
    report.taxonomyResolution={all:buildResolutionSummary(report.summary),public:buildResolutionSummary(report.publicSummary)};
    report.taxonomy={mainCategories:Number(mainCategories[0]?.count||0),subcategories:Number(subcategories[0]?.count||0),leafCategories:Number(leafDefinitions[0]?.count||0)};
    report.schema=buildSchemaReport(leafRows,manifest);
    report.countAlignment=buildCountAlignment(activeBase,{plans,subscriptions,now});
    report.businessDecisions={packageExpiry:{status:'PENDING',featureFlag:'platform_ad_lifecycle_enabled',enabled:lifecycleEnabled,previewMode:'read_only_safe_fallback',destructiveAction:false}};
    report.autoFixPlan=report.records.filter(record=>record.issues.some(issue=>issue.classification==='AUTO_FIX_SAFE')).map(record=>({adId:record.id,action:'category_remap_requires_separate_write_approval'}));
    process.stdout.write(JSON.stringify(report));
  }finally{await db.$disconnect();}
}
if(require.main===module)main().catch(error=>{console.error(error?.message||String(error));process.exitCode=1;});
module.exports={auditRow,summarize,classifySubcategoryReason,searchVisibilityBreakdown,buildCountAlignment,buildResolutionSummary,buildSchemaReport,publicFieldTrust,isActiveRow};
