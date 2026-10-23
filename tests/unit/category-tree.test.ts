import {expect,it} from 'vitest';
import {categoryTree,categoryReviewColor,normalizedCategoryName} from '@/lib/ad-categories/tree';
import type {CategoryOption,SubcategoryOption} from '@/lib/ad-categories/contracts';
const cats:CategoryOption[]=[{id:1,name:'عروض اخرى',active:true,order:0},{id:2,name:'عروض أخرى',active:false,order:1},{id:3,name:'وظائف',active:true,order:2},{id:4,name:'توظيف واعمال',active:true,order:3}];
const subs:SubcategoryOption[]=[{id:10,name:'فرع',categoryId:1,active:true,order:0,version:1,kind:'goods',priceEnabled:true,goodsEnabled:false,fields:[]}];
it('counts direct, branch and mismatched ads without double counting within a parent',()=>{
 const nodes=categoryTree(cats,subs,[{categoryId:1,subcategoryId:null,count:2},{categoryId:1,subcategoryId:10,count:3},{categoryId:2,subcategoryId:10,count:1},{categoryId:1,subcategoryId:999,count:4}]);
 expect(nodes[0]).toMatchObject({ads:10,directAds:6,children:[{ads:4}]});expect(nodes[1].ads).toBe(1);expect(nodes[1].active).toBe(false);
});
it('colors spelling variants and reviewed overlapping families consistently without merging identities',()=>{
 const nodes=categoryTree(cats,subs,[]);expect(nodes.map(n=>n.id)).toEqual([1,2,3,4]);expect(nodes[0].similar).toBe(nodes[1].similar);expect(nodes[2].similar).toBe(nodes[3].similar);expect(categoryReviewColor(nodes[0].similar!)).toEqual(categoryReviewColor(nodes[1].similar!));expect(normalizedCategoryName('أُخرى')).toBe('اخري');
});
