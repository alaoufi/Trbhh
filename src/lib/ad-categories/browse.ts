import 'server-only';
import {prisma} from '@/lib/prisma';
import {publicAdSearchWhere} from '@/lib/data';
import {getCategoryFormConfig} from './service';
import type {CategoryFormConfig} from './contracts';

/** Public discovery only. Creation/editing/admin retain the complete form config.
 * Do not cache inventory across requests: publishing the first ad or removing the
 * last one must change category availability without an admin toggle.
 */
export async function getBrowseCategoryConfig():Promise<CategoryFormConfig>{
 const config=await getCategoryFormConfig();
 if(!config.enabled)return config;
 const now=new Date();
 const buckets=await prisma.ads.groupBy({by:['category_id','subcategory_id'],where:{AND:[
  await publicAdSearchWhere({}),
  {paused_by_owner:0,platform_hidden_at:null,platform_archived_at:null},
  {OR:[{data_archive:null},{data_archive:''}]},
  {OR:[{data_delete:null},{data_delete:''}]},
  {OR:[{publish_at:null},{publish_at:{lte:now}}]},
 ]},_count:true});
 const occupied=new Set(buckets.filter(b=>b._count>0).map(b=>Number(b.category_id)));
 const categories=config.categories.filter(c=>c.active&&occupied.has(c.id));
 const roots=new Set(categories.map(c=>c.id));
 const branches=new Set(buckets.filter(b=>b._count>0&&b.subcategory_id!==null).map(b=>String(b.category_id)+':'+b.subcategory_id));
 return {...config,categories,subcategories:config.subcategories.filter(s=>s.active&&roots.has(s.categoryId)&&branches.has(s.categoryId+':'+s.id))};
}
