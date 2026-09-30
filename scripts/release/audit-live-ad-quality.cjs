'use strict';

const {PrismaClient}=require('@prisma/client');

const WRITE_GRANT=/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|TRIGGER|EXECUTE|FILE|PROCESS|SUPER|RELOAD|SHUTDOWN|GRANT OPTION)\b/i;
const classificationRank={AUTO_FIX_SAFE:1,NEEDS_REVIEW:2,INVALID_BUT_PRESERVE:3};

function json(value,fallback){
  if(value===null||value===undefined)return fallback;
  if(typeof value==='string'){try{return JSON.parse(value);}catch{return fallback;}}
  return value;
}
function number(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function definitionFields(raw){const parsed=json(raw,[]);return Array.isArray(parsed)?parsed:Array.isArray(parsed?.fields)?parsed.fields:[];}
function matchesStep(value,field){if(!(field.step>0))return true;const q=(value-number(field.min))/number(field.step);return Math.abs(q-Math.round(q))<=1e-8;}
function add(issues,code,classification,detail={}){issues.push({code,classification,...detail});}
function auditRow(row){
  const issues=[];
  if(!row.category_exists)add(issues,'invalid_category','INVALID_BUT_PRESERVE');
  if(!row.subcategory_id||!row.subcategory_matches)add(issues,'invalid_subcategory','INVALID_BUT_PRESERVE');
  if(!row.city_id||!row.area_id||!row.location_matches)add(issues,'missing_or_mismatched_location','NEEDS_REVIEW');
  const price=number(row.price),oldPrice=number(row.old_price);
  if(price<0||oldPrice<0||(oldPrice>0&&oldPrice<=price))add(issues,'invalid_price','INVALID_BUT_PRESERVE');
  if(price>0&&oldPrice>price&&Math.round((oldPrice-price)*100/oldPrice)>=80)add(issues,'suspicious_discount','NEEDS_REVIEW',{discountPercent:Math.round((oldPrice-price)*100/oldPrice)});
  const temporal=Boolean(row.rent_period)||row.price_type==='rent';
  if((row.sale_type==='sale'&&temporal)||(row.sale_type==='rent'&&!temporal))add(issues,'listing_price_mismatch','NEEDS_REVIEW');
  const fields=definitionFields(row.fields_json),values=json(row.values_json,{}),known=new Map(fields.map(field=>[field.key,field]));
  if(values&&typeof values==='object'&&!Array.isArray(values))for(const [key,value] of Object.entries(values)){
    const field=known.get(key);
    if(!field){add(issues,'field_not_in_category','INVALID_BUT_PRESERVE',{fieldKey:key});continue;}
    if(['number','decimal','year'].includes(field.type)){
      const n=Number(value);
      if(!Number.isFinite(n)||(field.min!==undefined&&n<number(field.min))||(field.max!==undefined&&n>number(field.max))||!matchesStep(n,field))add(issues,'impossible_field_range','INVALID_BUT_PRESERVE',{fieldKey:key,value});
    }
    if(field.unit&&typeof field.unit!=='string')add(issues,'invalid_unit','INVALID_BUT_PRESERVE',{fieldKey:key});
  }
  if(row.subcategory_id&&!row.values_json)add(issues,'legacy_values_not_migrated','NEEDS_REVIEW');
  return issues;
}
function summarize(rows,duplicates){
  const summary={records:rows.length,clean:0,AUTO_FIX_SAFE:0,NEEDS_REVIEW:0,INVALID_BUT_PRESERVE:0,issues:{},duplicateCandidates:duplicates.length};
  const records=[];
  for(const row of rows){const issues=auditRow(row);if(!issues.length){summary.clean++;continue;}const kinds=new Set(issues.map(issue=>issue.classification));for(const kind of kinds)summary[kind]++;for(const issue of issues)summary.issues[issue.code]=(summary.issues[issue.code]||0)+1;records.push({id:String(row.id),classification:issues.reduce((best,issue)=>classificationRank[issue.classification]>classificationRank[best]?issue.classification:best,'AUTO_FIX_SAFE'),issues});}
  return {generatedAt:new Date().toISOString(),readOnly:true,summary,records,duplicateCandidates:duplicates.map(row=>({normalizedTitle:row.normalized_title,count:Number(row.count),ids:String(row.ids).split(',')}))};
}
async function main(){
  const db=new PrismaClient();
  try{
    const grants=await db.$queryRawUnsafe('SHOW GRANTS FOR CURRENT_USER()');
    const grantText=grants.flatMap(row=>Object.values(row).map(String)).join(' ');
    if(!/\bSELECT\b/i.test(grantText)||WRITE_GRANT.test(grantText))throw new Error('audit_requires_read_only_database_user');
    const rows=await db.$queryRawUnsafe(`
      SELECT a.id,a.title,a.category_id,a.subcategory_id,a.city_id,a.area_id,a.price,a.old_price,a.sale_type,a.price_type,a.rent_period,
        (c.id IS NOT NULL) AS category_exists,
        (s.id IS NOT NULL AND s.category_id=CAST(a.category_id AS UNSIGNED)) AS subcategory_matches,
        (ar.id IS NOT NULL AND ar.city_id=CAST(a.city_id AS UNSIGNED)) AS location_matches,
        d.fields_json,v.values_json
      FROM ads a
      LEFT JOIN categories c ON c.id=a.category_id
      LEFT JOIN sub_categories s ON s.id=a.subcategory_id
      LEFT JOIN areas ar ON ar.id=a.area_id
      LEFT JOIN ad_category_definitions d ON d.subcategory_id=a.subcategory_id
      LEFT JOIN ad_category_values v ON v.ad_id=a.id AND v.subcategory_id=a.subcategory_id
      ORDER BY a.id`);
    const duplicates=await db.$queryRawUnsafe(`
      SELECT LOWER(TRIM(title)) AS normalized_title,COUNT(*) AS count,GROUP_CONCAT(id ORDER BY id) AS ids
      FROM ads WHERE TRIM(title)<>'' GROUP BY LOWER(TRIM(title)) HAVING COUNT(*)>1 ORDER BY count DESC LIMIT 200`);
    const [mainCategories,subcategories,leafDefinitions]=await Promise.all([
      db.$queryRawUnsafe('SELECT COUNT(*) AS count FROM categories WHERE is_active=\'yes\''),
      db.$queryRawUnsafe('SELECT COUNT(*) AS count FROM sub_categories WHERE active=1'),
      db.$queryRawUnsafe('SELECT COUNT(*) AS count FROM ad_category_definitions d JOIN sub_categories s ON s.id=d.subcategory_id WHERE s.active=1'),
    ]);
    const report=summarize(rows,duplicates);
    report.taxonomy={mainCategories:Number(mainCategories[0]?.count||0),subcategories:Number(subcategories[0]?.count||0),leafCategories:Number(leafDefinitions[0]?.count||0)};
    process.stdout.write(JSON.stringify(report));
  }finally{await db.$disconnect();}
}
if(require.main===module)main().catch(error=>{console.error(error?.message||String(error));process.exitCode=1;});
module.exports={auditRow,summarize};
