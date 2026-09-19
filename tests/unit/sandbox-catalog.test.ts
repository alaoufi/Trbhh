import { describe, expect, it } from 'vitest';
import { catalog } from '../../preview-v2/lib/category-fields';
import { sandboxCatalogOptions, normalizeSandboxCategory, createSandboxCatalog } from '@/lib/sandbox-catalog';

const categories = [{id:1n,name:'سيارات'},{id:2n,name:'أخرى'},{id:3n,name:'قديم'}];
const subs = [{id:10n,category_id:1,name:'سيارات'},{id:20n,category_id:2,name:'كتب'},{id:21n,category_id:2,name:'أخرى'},{id:30n,category_id:3,name:'كتب'},{id:40n,category_id:1,name:'غير معروف'}];
// Evaluate the small predicate vocabulary on rows (including SQL-null fallback).
function matches(where: Record<string, unknown>, row: {category_id:bigint;subcategory_id:number|null}): boolean {
  return Object.entries(where).every(([key,value])=> {
    if(key==='OR') return (value as Record<string,unknown>[]).some(w=>matches(w,row));
    if(key==='NOT') return !matches(value as Record<string,unknown>,row);
    if(key==='id') return false; // impossible empty group
    return row[key as keyof typeof row]===value;
  });
}
describe('sandbox public catalog',()=>{
  it('uses exactly the new-ad catalog without inherited URL names',()=>{
    expect(sandboxCatalogOptions).toEqual(Object.entries(catalog).map(([name,children])=>({name,subcategories:Object.keys(children)})));
    expect(normalizeSandboxCategory({category:'سيارات',subcategory:'سيارات'})).toEqual({category:'سيارات',subcategory:'سيارات'});
    for(const name of ['constructor','__proto__','toString','unknown']) {
      expect(normalizeSandboxCategory({category:name,subcategory:name})).toEqual({});
      expect(normalizeSandboxCategory({category:'سيارات',subcategory:name})).toEqual({category:'سيارات'});
    }
    expect(normalizeSandboxCategory({subcategory:'كتب'})).toEqual({});
  });
  it('maps exact parent-child IDs, never title guesses or a valid category with the wrong child',()=>{
    const map=createSandboxCatalog(categories,subs);
    expect(map.display(1n,10)).toEqual({category:'سيارات',subcategory:'سيارات'});
    expect(map.display(2n,20)).toEqual({category:'أخرى',subcategory:'كتب'});
    for(const [category,sub] of [[1n,20],[1n,null],[1n,40],[99n,10],[3n,30]] as const)
      expect(map.display(category,sub)).toEqual({category:'أخرى',subcategory:'أخرى'});
  });
  it('filters real pairs and includes every unknown pair only in the fallback group',()=>{
    const map=createSandboxCatalog(categories,subs);
    const rows=[{category_id:1n,subcategory_id:10},{category_id:2n,subcategory_id:20},{category_id:2n,subcategory_id:21},{category_id:1n,subcategory_id:null},{category_id:99n,subcategory_id:10},{category_id:1n,subcategory_id:20},{category_id:3n,subcategory_id:30}];
    const select=(category:string,subcategory?:string)=>rows.filter(row=>matches(map.where({category,subcategory}) as Record<string,unknown>,row));
    expect(select('سيارات')).toEqual([rows[0]]);
    expect(select('أخرى','كتب')).toEqual([rows[1]]);
    expect(select('أخرى','أخرى')).toEqual(rows.slice(2));
    expect(select('أخرى')).toEqual(rows.slice(1));
    expect(select('عقارات')).toEqual([]);
    expect(map.where({})).toEqual({});
  });
  it('empty legacy tables leave ads in fallback without mutating the input',()=>{
    const map=createSandboxCatalog([],[]);
    expect(map.display(500n,null)).toEqual({category:'أخرى',subcategory:'أخرى'});
    expect(map.where({category:'أخرى',subcategory:'أخرى'})).toEqual({});
    expect(map.where({category:'سيارات'})).toEqual({id:{in:[]}});
    expect(categories[0]).toEqual({id:1n,name:'سيارات'});
  });
});
