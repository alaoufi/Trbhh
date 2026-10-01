import 'server-only';
import {Prisma, type PrismaClient} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {getSetting} from '@/lib/settings';
import {CATEGORY_LABELS, categoryEnabled, categoryId, categoryPolicy, parseCategorySubmission, type CategoryFormConfig, type SubcategoryOption} from './contracts';
import {CategoryValidationError,cardCategoryValues,comparableCategoryValues, validateDefinition, visibleCategoryValues, type CategoryValues} from './validation';
import {CATEGORY_LATEST_TEMPLATES_SETTING, categoryFieldsFingerprint, resolveCategoryDefinition} from './template-upgrade';
import {applyPreviewCategoryVisibility,isReadOnlyPreview,parsePreviewCategoryVisibility,PREVIEW_CATEGORY_VISIBILITY_KEY} from '@/lib/read-only-preview';
import {previewHashGetAll} from '@/lib/redis';
import {defaultListingPolicy,inferLegacyListingType,normalizeListingSubmission,validateListingPolicy,type NormalizedListingSubmission} from './listing-policy';
import {decodeStoredCategoryDefinition} from './storage';
import {categorySeedDefinition,findCategorySeedTemplate} from './seed-templates';
import {buildPublicCategoryTaxonomy} from './taxonomy';
import {publicCategoryFieldTrust,type PublicCategoryTrustReason} from './public-trust';
type Tx=Prisma.TransactionClient;
type DefinitionRow={subcategory_id:bigint;version:number;kind:string;price_enabled:number;goods_enabled:number;fields_json:unknown};
const json=(v:unknown):unknown=>typeof v==='string'?JSON.parse(v):v;
function definition(r:DefinitionRow, names?:{categoryName:string;subcategoryName:string;useLatestTemplates:boolean}) {
  const stored=decodeStoredCategoryDefinition(r.fields_json);
  const base={version:r.version,kind:r.kind as SubcategoryOption['kind'],...categoryPolicy({kind:r.kind,priceEnabled:r.price_enabled===1,goodsEnabled:r.goods_enabled===1}),fields:validateDefinition(stored.fields),listingPolicy:stored.listingPolicy?validateListingPolicy(stored.listingPolicy):defaultListingPolicy(r.kind),fieldsFingerprint:categoryFieldsFingerprint(stored.fields)};
  const template=names?findCategorySeedTemplate(names.categoryName,names.subcategoryName):undefined;
  const resolved=names?resolveCategoryDefinition(base,names.categoryName,names.subcategoryName,names.useLatestTemplates):{...base,upgradedFromBuiltInV1:false};
  return {...resolved,templateKey:stored.templateKey||template?.key};
}
function seededDefinition(categoryName:string,subcategoryName:string){
  const template=findCategorySeedTemplate(categoryName,subcategoryName);
  return template?categorySeedDefinition(template):undefined;
}
export async function getCategoryFormConfig(admin=false):Promise<CategoryFormConfig> {
  const defaultEnabled=process.env.CATEGORIES_DEFAULT_ENABLED==='1';
  const [enabledValue,latestTemplatesValue]=await Promise.all([getSetting('categories_v2_enabled',defaultEnabled?'1':'0'),getSetting(CATEGORY_LATEST_TEMPLATES_SETTING,'1')]);
  const enabled=categoryEnabled(enabledValue),useLatestTemplates=categoryEnabled(latestTemplatesValue);
  const labels={...CATEGORY_LABELS};
  for(const k of Object.keys(labels) as (keyof typeof labels)[]) labels[k]=await getSetting(`categories_v2_label_${k}`,labels[k]);
  if(!enabled&&!admin) return {enabled,useLatestTemplates,labels,categories:[],subcategories:[],groups:[]};
  const [cats,subs,defs]=await Promise.all([prisma.categories.findMany({orderBy:{ordered:'asc'}}),prisma.sub_categories.findMany({orderBy:{order:'asc'}}),prisma.$queryRaw<DefinitionRow[]>`SELECT * FROM ad_category_definitions`]);
  const dm=new Map(defs.map(d=>[Number(d.subcategory_id),d]));
  const catById=new Map(cats.map(c=>[Number(c.id),c]));
  const baseCategories=cats.map(c=>({id:Number(c.id),name:c.name,active:c.is_active==='yes',order:c.ordered}));
  const baseSubcategories=subs.map(s=>{
    const categoryName=catById.get(s.category_id)?.name||'';
    const configured=dm.has(Number(s.id))
      ?definition(dm.get(Number(s.id))!,{categoryName,subcategoryName:s.name,useLatestTemplates})
      :seededDefinition(categoryName,s.name);
    return {id:Number(s.id),categoryId:s.category_id,name:s.name,active:s.active===1,order:s.order,...(configured??{version:0,kind:'other' as const,priceEnabled:true,goodsEnabled:false,fields:[],listingPolicy:defaultListingPolicy('other')})};
  });
  const resolved=isReadOnlyPreview()
    ?applyPreviewCategoryVisibility(baseCategories,baseSubcategories,parsePreviewCategoryVisibility(await previewHashGetAll(PREVIEW_CATEGORY_VISIBILITY_KEY)))
    :{categories:baseCategories,subcategories:baseSubcategories};
  const activeCategoryIds=new Set(resolved.categories.filter(c=>c.active).map(c=>c.id));
  const availableSubcategories=resolved.subcategories.filter(s=>s.active&&s.version>0&&activeCategoryIds.has(s.categoryId));
  const publicTaxonomy=buildPublicCategoryTaxonomy(resolved.categories,availableSubcategories);
  return {enabled,useLatestTemplates,labels,categories:resolved.categories.filter(c=>admin||c.active),subcategories:admin?resolved.subcategories:publicTaxonomy.subcategories,groups:publicTaxonomy.groups};
}
export type CategorySelection={category_id:bigint;subcategory_id:number;cat_reviewed:number;priceEnabled:boolean;goodsEnabled:boolean;listing:NormalizedListingSubmission};
export type CategoryEditContext={adId:bigint;memberId:bigint};
type PreservedPricing={price:number;price_type:string|null;rent_period:string|null;sale_type:string|null;old_price:number;stock_state:number};
/** The caller's actual ads.create/update and its values commit or rollback together. */
export async function writeAdWithCategory<T extends {id:bigint}>(db:PrismaClient,fd:FormData,write:(tx:Tx,selection:CategorySelection|null,preserved?:PreservedPricing)=>Promise<T>,edit?:CategoryEditContext):Promise<T> {
  return db.$transaction(async tx=>{
    const rows=await tx.$queryRaw<{k:string;v:string|null}[]>`SELECT k,v FROM site_settings WHERE k IN ('categories_v2_enabled',${CATEGORY_LATEST_TEMPLATES_SETTING}) FOR SHARE`;
    const settings=new Map(rows.map(row=>[row.k,row.v]));
    // Edit authority comes only from the authenticated caller, never FormData IDs.
    const existing=edit?(await tx.$queryRaw<(PreservedPricing&{id:bigint;user_id:bigint;category_id:bigint;subcategory_id:number|null;cat_reviewed:number})[]>`SELECT id,user_id,category_id,subcategory_id,cat_reviewed,price,price_type,rent_period,sale_type,old_price,stock_state FROM ads WHERE id=${edit.adId} FOR UPDATE`)[0]:undefined;
    if(edit&&(!existing||existing.user_id!==edit.memberId)) throw new CategoryValidationError('','الإعلان غير متاح للتعديل');
    if(fd.get('category_mode')==='preserve') {
      if(!existing||!edit) throw new CategoryValidationError('','إبقاء التصنيف متاح للتعديل فقط');
      if(['category_id','subcategory_id','category_version','category_values'].some(k=>fd.has(k))) throw new CategoryValidationError('','لا يمكن تغيير التصنيف في وضع الإبقاء');
      const cats=await tx.$queryRaw<{id:bigint;name:string}[]>`SELECT id,name FROM categories WHERE id=${existing.category_id} AND is_active='yes' FOR SHARE`;
      const subs=existing.subcategory_id===null?[]:await tx.$queryRaw<{id:bigint;name:string}[]>`SELECT id,name FROM sub_categories WHERE id=${existing.subcategory_id} AND category_id=${existing.category_id} AND active=1 FOR SHARE`;
      const defs=existing.subcategory_id===null?[]:await tx.$queryRaw<{subcategory_id:bigint}[]>`SELECT subcategory_id FROM ad_category_definitions WHERE subcategory_id=${existing.subcategory_id} FOR SHARE`;
      if(cats.length&&subs.length&&(defs.length||seededDefinition(cats[0].name,subs[0].name))) throw new CategoryValidationError('','التصنيف نشط؛ يجب التحقق من حقوله');
      const {price,price_type,rent_period,sale_type,old_price,stock_state}=existing;
      const ad=await write(tx,null,{price,price_type,rent_period,sale_type,old_price,stock_state});
      if(ad.id!==edit.adId) throw new CategoryValidationError('','الإعلان غير مطابق');
      const after=await tx.ads.findUniqueOrThrow({where:{id:edit.adId},select:{category_id:true,subcategory_id:true,cat_reviewed:true}});
      if(after.category_id!==existing.category_id||after.subcategory_id!==existing.subcategory_id||after.cat_reviewed!==existing.cat_reviewed) throw new CategoryValidationError('','لا يمكن تغيير التصنيف في وضع الإبقاء');
      return ad;
    }
    if(!categoryEnabled(settings.get('categories_v2_enabled'))) {
      if(fd.has('category_version')) throw new CategoryValidationError('','تم إيقاف الأقسام؛ أعد تحميل الصفحة');
      return write(tx,null);
    }
    const cid=categoryId(fd.get('category_id')),sid=categoryId(fd.get('subcategory_id'));
    const cats=await tx.$queryRaw<{id:bigint;name:string}[]>`SELECT id,name FROM categories WHERE id=${cid} AND is_active='yes' FOR SHARE`;
    const subs=await tx.$queryRaw<{id:bigint;name:string}[]>`SELECT id,name FROM sub_categories WHERE id=${sid} AND category_id=${cid} AND active=1 FOR SHARE`;
    const defs=await tx.$queryRaw<DefinitionRow[]>`SELECT * FROM ad_category_definitions WHERE subcategory_id=${sid} FOR SHARE`;
    if(!cats.length||!subs.length) throw new CategoryValidationError('','القسم غير متاح');
    const def=defs.length
      ?definition(defs[0],{categoryName:cats[0].name,subcategoryName:subs[0].name,useLatestTemplates:categoryEnabled(settings.get(CATEGORY_LATEST_TEMPLATES_SETTING)??'1')})
      :seededDefinition(cats[0].name,subs[0].name);
    if(!def) throw new CategoryValidationError('','القسم غير متاح');
    const listing=normalizeListingSubmission(def.listingPolicy,{listingType:fd.get('listingType'),pricingMode:fd.get('pricingMode'),price:fd.get('price')});
    let grandfatherMissingRequired:ReadonlySet<string>|undefined;
    if(edit&&existing&&Number(existing.category_id)===cid&&existing.subcategory_id===sid){
      const previousRows=await tx.$queryRaw<{values_json:unknown}[]>`SELECT values_json FROM ad_category_values WHERE ad_id=${edit.adId} AND subcategory_id=${sid} FOR SHARE`;
      const previous=(previousRows.length?json(previousRows[0].values_json):{}) as CategoryValues;
      grandfatherMissingRequired=new Set(def.fields.filter(field=>field.required&&!Object.hasOwn(previous,field.key)).map(field=>field.key));
    }
    const values=parseCategorySubmission(fd,{...def,id:sid,categoryId:cid},listing.listingType,grandfatherMissingRequired);
    const ad=await write(tx,{category_id:BigInt(cid),subcategory_id:sid,cat_reviewed:1,priceEnabled:def.priceEnabled,goodsEnabled:def.goodsEnabled,listing});
    await tx.$executeRaw`INSERT INTO ad_category_values (ad_id,subcategory_id,definition_version,values_json) VALUES (${ad.id},${sid},${def.version},${JSON.stringify(values)}) ON DUPLICATE KEY UPDATE subcategory_id=VALUES(subcategory_id),definition_version=VALUES(definition_version),values_json=VALUES(values_json)`;
    return ad;
  });
}
export async function getCategoryEditValues(id:bigint):Promise<CategoryValues> {
  if(!categoryEnabled(await getSetting('categories_v2_enabled',process.env.CATEGORIES_DEFAULT_ENABLED==='1'?'1':'0'))) return {};
  const rows=await prisma.$queryRaw<{values_json:unknown}[]>`SELECT values_json FROM ad_category_values WHERE ad_id=${id}`;
  return rows.length?json(rows[0].values_json) as CategoryValues:{};
}
export type PublicCategory={priceEnabled:boolean;goodsEnabled:boolean;listingType:string;categoryFieldsTrusted:boolean;categoryFieldsSuppressedReason?:PublicCategoryTrustReason;categoryFields:ReturnType<typeof visibleCategoryValues>;categoryCardFields:ReturnType<typeof cardCategoryValues>;comparableCategoryFields:ReturnType<typeof comparableCategoryValues>;subcategoryName?:string};
export async function getPublicCategories(ids:bigint[]):Promise<Map<number,PublicCategory>> {
  const out=new Map<number,PublicCategory>();
  const [enabledValue,latestTemplatesValue]=await Promise.all([getSetting('categories_v2_enabled',process.env.CATEGORIES_DEFAULT_ENABLED==='1'?'1':'0'),getSetting(CATEGORY_LATEST_TEMPLATES_SETTING,'1')]);
  if(!ids.length||!categoryEnabled(enabledValue)) return out;
  const [rows,previewVisibility]=await Promise.all([
    prisma.$queryRaw<((Omit<DefinitionRow,'subcategory_id'|'version'|'kind'|'price_enabled'|'goods_enabled'> & {subcategory_id:bigint|null;version:number|null;kind:string|null;price_enabled:number|null;goods_enabled:number|null})&{ad_id:bigint;title:string;category_id:bigint;selected_subcategory_id:bigint;values_json:unknown;subcategory_name:string;category_name:string;active:number;is_active:string;sale_type:string|null;adsType:string;price_type:string|null})[]>(Prisma.sql`SELECT a.id AS ad_id,a.title,a.sale_type,a.adsType,a.price_type,c.id AS category_id,s.id AS selected_subcategory_id,d.*,v.values_json,s.name AS subcategory_name,c.name AS category_name,s.active,c.is_active FROM ads a JOIN sub_categories s ON s.id=a.subcategory_id AND s.category_id=a.category_id JOIN categories c ON c.id=a.category_id LEFT JOIN ad_category_definitions d ON d.subcategory_id=s.id LEFT JOIN ad_category_values v ON v.ad_id=a.id AND v.subcategory_id=s.id WHERE a.id IN (${Prisma.join(ids)})`),
    isReadOnlyPreview()?previewHashGetAll(PREVIEW_CATEGORY_VISIBILITY_KEY).then(parsePreviewCategoryVisibility):Promise.resolve(parsePreviewCategoryVisibility({})),
  ]);
  for(const r of rows){
    const d=r.subcategory_id===null
      ?seededDefinition(r.category_name,r.subcategory_name)
      :definition(r as DefinitionRow,{categoryName:r.category_name,subcategoryName:r.subcategory_name,useLatestTemplates:categoryEnabled(latestTemplatesValue)});
    if(!d)continue;
    const visibility=applyPreviewCategoryVisibility([{id:Number(r.category_id),active:r.is_active==='yes'}],[{id:Number(r.selected_subcategory_id),active:r.active===1}],previewVisibility);
    const active=visibility.categories[0].active&&visibility.subcategories[0].active;
    const values=(json(r.values_json)||{}) as CategoryValues,listingType=inferLegacyListingType({listingType:r.sale_type,adsType:r.adsType,priceType:r.price_type});
    const context={listingType};
    const trust=publicCategoryFieldTrust({templateKey:d.templateKey,title:r.title||'',values}),project=active&&trust.trusted;
    out.set(Number(r.ad_id),{priceEnabled:d.priceEnabled,goodsEnabled:d.goodsEnabled,listingType,categoryFieldsTrusted:trust.trusted,...(!trust.trusted?{categoryFieldsSuppressedReason:trust.reason}:{}),subcategoryName:project?r.subcategory_name:undefined,categoryFields:project?visibleCategoryValues(d.fields,values,context):[],categoryCardFields:project?cardCategoryValues(d.fields,values,context).slice(0,2):[],comparableCategoryFields:project?comparableCategoryValues(d.fields,values,context):[]});
  }
  return out;
}
