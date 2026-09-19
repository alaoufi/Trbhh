import 'server-only';
import {Prisma, type PrismaClient} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {getSetting} from '@/lib/settings';
import {CATEGORY_LABELS, categoryEnabled, categoryId, categoryPolicy, parseCategorySubmission, type CategoryFormConfig, type SubcategoryOption} from './contracts';
import {CategoryValidationError, validateDefinition, visibleCategoryValues, type CategoryValues} from './validation';
type Tx=Prisma.TransactionClient;
type DefinitionRow={subcategory_id:bigint;version:number;kind:string;price_enabled:number;goods_enabled:number;fields_json:unknown};
const json=(v:unknown):unknown=>typeof v==='string'?JSON.parse(v):v;
function definition(r:DefinitionRow) {
  return {version:r.version,kind:r.kind as SubcategoryOption['kind'],...categoryPolicy({kind:r.kind,priceEnabled:r.price_enabled===1,goodsEnabled:r.goods_enabled===1}),fields:validateDefinition(json(r.fields_json))};
}
export async function getCategoryFormConfig(admin=false):Promise<CategoryFormConfig> {
  const enabled=categoryEnabled(await getSetting('categories_v2_enabled','0'));
  const labels={...CATEGORY_LABELS};
  for(const k of Object.keys(labels) as (keyof typeof labels)[]) labels[k]=await getSetting(`categories_v2_label_${k}`,labels[k]);
  if(!enabled&&!admin) return {enabled,labels,categories:[],subcategories:[]};
  const [cats,subs,defs]=await Promise.all([prisma.categories.findMany({orderBy:{ordered:'asc'}}),prisma.sub_categories.findMany({orderBy:{order:'asc'}}),prisma.$queryRaw<DefinitionRow[]>`SELECT * FROM ad_category_definitions`]);
  const dm=new Map(defs.map(d=>[Number(d.subcategory_id),d]));
  return {enabled,labels,categories:cats.filter(c=>admin||c.is_active==='yes').map(c=>({id:Number(c.id),name:c.name,active:c.is_active==='yes',order:c.ordered})),subcategories:subs.filter(s=>admin||(s.active===1&&dm.has(Number(s.id))&&cats.some(c=>Number(c.id)===s.category_id&&c.is_active==='yes'))).map(s=>({id:Number(s.id),categoryId:s.category_id,name:s.name,active:s.active===1,order:s.order,...(dm.has(Number(s.id))?definition(dm.get(Number(s.id))!):{version:0,kind:'other' as const,priceEnabled:true,goodsEnabled:false,fields:[]})}))};
}
export type CategorySelection={category_id:bigint;subcategory_id:number;cat_reviewed:number;priceEnabled:boolean;goodsEnabled:boolean};
export type CategoryEditContext={adId:bigint;memberId:bigint};
type PreservedPricing={price:number;price_type:string|null;rent_period:string|null;old_price:number;stock_state:number};
/** The caller's actual ads.create/update and its values commit or rollback together. */
export async function writeAdWithCategory<T extends {id:bigint}>(db:PrismaClient,fd:FormData,write:(tx:Tx,selection:CategorySelection|null,preserved?:PreservedPricing)=>Promise<T>,edit?:CategoryEditContext):Promise<T> {
  return db.$transaction(async tx=>{
    const rows=await tx.$queryRaw<{v:string|null}[]>`SELECT v FROM site_settings WHERE k='categories_v2_enabled' FOR SHARE`;
    // Edit authority comes only from the authenticated caller, never FormData IDs.
    const existing=edit?(await tx.$queryRaw<(PreservedPricing&{id:bigint;user_id:bigint;category_id:bigint;subcategory_id:number|null;cat_reviewed:number})[]>`SELECT id,user_id,category_id,subcategory_id,cat_reviewed,price,price_type,rent_period,old_price,stock_state FROM ads WHERE id=${edit.adId} FOR UPDATE`)[0]:undefined;
    if(edit&&(!existing||existing.user_id!==edit.memberId)) throw new CategoryValidationError('','الإعلان غير متاح للتعديل');
    if(fd.get('category_mode')==='preserve') {
      if(!existing||!edit) throw new CategoryValidationError('','إبقاء التصنيف متاح للتعديل فقط');
      if(['category_id','subcategory_id','category_version','category_values'].some(k=>fd.has(k))) throw new CategoryValidationError('','لا يمكن تغيير التصنيف في وضع الإبقاء');
      const cats=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM categories WHERE id=${existing.category_id} AND is_active='yes' FOR SHARE`;
      const subs=existing.subcategory_id===null?[]:await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM sub_categories WHERE id=${existing.subcategory_id} AND category_id=${existing.category_id} AND active=1 FOR SHARE`;
      const defs=existing.subcategory_id===null?[]:await tx.$queryRaw<{subcategory_id:bigint}[]>`SELECT subcategory_id FROM ad_category_definitions WHERE subcategory_id=${existing.subcategory_id} FOR SHARE`;
      if(cats.length&&subs.length&&defs.length) throw new CategoryValidationError('','التصنيف نشط؛ يجب التحقق من حقوله');
      const {price,price_type,rent_period,old_price,stock_state}=existing;
      const ad=await write(tx,null,{price,price_type,rent_period,old_price,stock_state});
      if(ad.id!==edit.adId) throw new CategoryValidationError('','الإعلان غير مطابق');
      const after=await tx.ads.findUniqueOrThrow({where:{id:edit.adId},select:{category_id:true,subcategory_id:true,cat_reviewed:true}});
      if(after.category_id!==existing.category_id||after.subcategory_id!==existing.subcategory_id||after.cat_reviewed!==existing.cat_reviewed) throw new CategoryValidationError('','لا يمكن تغيير التصنيف في وضع الإبقاء');
      return ad;
    }
    if(!categoryEnabled(rows[0]?.v)) {
      if(fd.has('category_version')) throw new CategoryValidationError('','تم إيقاف الأقسام؛ أعد تحميل الصفحة');
      return write(tx,null);
    }
    const cid=categoryId(fd.get('category_id')),sid=categoryId(fd.get('subcategory_id'));
    const cats=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM categories WHERE id=${cid} AND is_active='yes' FOR SHARE`;
    const subs=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM sub_categories WHERE id=${sid} AND category_id=${cid} AND active=1 FOR SHARE`;
    const defs=await tx.$queryRaw<DefinitionRow[]>`SELECT * FROM ad_category_definitions WHERE subcategory_id=${sid} FOR SHARE`;
    if(!cats.length||!subs.length||!defs.length) throw new CategoryValidationError('','القسم غير متاح');
    const def=definition(defs[0]);
    const values=parseCategorySubmission(fd,{...def,id:sid,categoryId:cid});
    const ad=await write(tx,{category_id:BigInt(cid),subcategory_id:sid,cat_reviewed:1,priceEnabled:def.priceEnabled,goodsEnabled:def.goodsEnabled});
    await tx.$executeRaw`INSERT INTO ad_category_values (ad_id,subcategory_id,definition_version,values_json) VALUES (${ad.id},${sid},${def.version},${JSON.stringify(values)}) ON DUPLICATE KEY UPDATE subcategory_id=VALUES(subcategory_id),definition_version=VALUES(definition_version),values_json=VALUES(values_json)`;
    return ad;
  });
}
export async function getCategoryEditValues(id:bigint):Promise<CategoryValues> {
  if(!categoryEnabled(await getSetting('categories_v2_enabled','0'))) return {};
  const rows=await prisma.$queryRaw<{values_json:unknown}[]>`SELECT values_json FROM ad_category_values WHERE ad_id=${id}`;
  return rows.length?json(rows[0].values_json) as CategoryValues:{};
}
export type PublicCategory={priceEnabled:boolean;goodsEnabled:boolean;categoryFields:ReturnType<typeof visibleCategoryValues>;subcategoryName?:string};
export async function getPublicCategories(ids:bigint[]):Promise<Map<number,PublicCategory>> {
  const out=new Map<number,PublicCategory>();
  if(!ids.length||!categoryEnabled(await getSetting('categories_v2_enabled','0'))) return out;
  const rows=await prisma.$queryRaw<(DefinitionRow&{ad_id:bigint;values_json:unknown;name:string;active:number;is_active:string})[]>(Prisma.sql`SELECT a.id AS ad_id,d.*,v.values_json,s.name,s.active,c.is_active FROM ads a JOIN sub_categories s ON s.id=a.subcategory_id AND s.category_id=a.category_id JOIN categories c ON c.id=a.category_id JOIN ad_category_definitions d ON d.subcategory_id=s.id LEFT JOIN ad_category_values v ON v.ad_id=a.id AND v.subcategory_id=s.id WHERE a.id IN (${Prisma.join(ids)})`);
  for(const r of rows){const d=definition(r);out.set(Number(r.ad_id),{priceEnabled:d.priceEnabled,goodsEnabled:d.goodsEnabled,subcategoryName:r.active===1&&r.is_active==='yes'?r.name:undefined,categoryFields:r.active===1&&r.is_active==='yes'?visibleCategoryValues(d.fields,(json(r.values_json)||{}) as CategoryValues):[]});}
  return out;
}
