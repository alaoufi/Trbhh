import 'server-only';
import { prisma } from './prisma';
import { getSetting, getSettingBool } from './settings';
import { ensureSchema } from '@/data/schema-sync';
import { validateCategoryValues, applicableCategoryFields, type CategoryOption, type FieldVisibility } from '@/domain/category-fields';

export const categoriesOn = () => getSettingBool('categories_v2_on', false);
export async function categoryLabels() {
  const [title, intro, category, branch, details] = await Promise.all([
    getSetting('categories_v2_title', 'تصفّح حسب القسم'),
    getSetting('categories_v2_intro', 'كل ما تبحث عنه في مكان واحد. اختر القسم للوصول إلى الإعلانات المناسبة.'),
    getSetting('categories_v2_category_label', 'القسم الرئيسي'),
    getSetting('categories_v2_branch_label', 'القسم الفرعي'),
    getSetting('categories_v2_details_label', 'المواصفات المتخصصة'),
  ]);
  return { title, intro, category, branch, details };
}
export async function categoryOptions(): Promise<CategoryOption[]> {
  await ensureSchema();
  const [cats, subs, fields] = await Promise.all([
    prisma.categories.findMany({ orderBy: [{ordered:'desc'},{id:'asc'}] }),
    prisma.sub_categories.findMany({ orderBy: [{order:'asc'},{id:'asc'}] }),
    prisma.category_field_defs.findMany({ where: {active:1, archived_at:null}, orderBy:{ordered:'asc'} }),
  ]);
  return cats.map((cat) => ({ id:Number(cat.id),name:cat.name,active:cat.is_active==='yes',
    branches:subs.filter(s=>s.category_id===Number(cat.id)).map(s=>({id:Number(s.id),name:s.name,active:s.active===1})),
    fields:fields.filter(f=>f.category_id===cat.id).map(f=>({id:Number(f.id),key:f.field_key,label:f.label,type:f.field_type,unit:f.unit||undefined,subcategoryId:f.subcategory_id==null?null:Number(f.subcategory_id),visibility:parseVisibility(f.visibility_rule),options:(f.options||'').split('|').filter(Boolean),required:f.required===1})),
  }));
}

function parseVisibility(value: string | null): FieldVisibility | undefined {
  if (!value || value === 'always') return value === 'always' ? {kind:'always'} : undefined;
  try {
    const parsed = JSON.parse(value) as { field?: string; value?: string };
    return parsed.field && parsed.value !== undefined ? {kind:'equals',field:parsed.field,value:parsed.value} : undefined;
  } catch { return undefined; }
}
export async function categoryFormData(adId?: number) {
  if (!(await categoriesOn())) return undefined;
  const [options, labels, rows] = await Promise.all([categoryOptions(),categoryLabels(),adId ? prisma.ad_category_field_values.findMany({where:{ad_id:BigInt(adId)}}) : Promise.resolve([])]);
  return { options, labels, values:Object.fromEntries(rows.map(r=>[String(r.field_id),r.value_text||''])) };
}
export async function validateAdCategory(form: FormData, current?: {category_id:bigint;subcategory_id:number|null}) {
  if (!(await categoriesOn())) return null;
  const id = Number(form.get('category_id'));
  if (!Number.isSafeInteger(id)||id<=0) throw new Error('اختر قسم الإعلان');
  const cat=(await categoryOptions()).find(c=>c.id===id);
  const retaining = current?.category_id===BigInt(id);
  if (!cat || (!cat.active && !retaining)) throw new Error('القسم غير متاح لإعلانات جديدة');
  const sub = Number(form.get('subcategory_id')) || null;
  if (sub && !cat.branches.some(s=>s.id===sub&&(s.active || (retaining&&current?.subcategory_id===sub)))) throw new Error('الفرع لا ينتمي للقسم أو غير متاح');
  const input:Record<string,string>={};
  for (const [key,value] of form.entries()) if(key.startsWith('category_field_')) input[key.slice(15)]=String(value);
  const selected = cat.fields.filter(f=>f.subcategoryId==null || f.subcategoryId===sub);
  const byKey = Object.fromEntries(selected.map(f=>[f.key,input[String(f.id)]||'']));
  const values=validateCategoryValues(applicableCategoryFields(selected,sub,byKey),input,!!retaining);
  return {category_id:BigInt(id),subcategory_id:sub,values};
}
