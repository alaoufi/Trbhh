import {expect,it} from 'vitest';import {planCategoryOrder,validateOrderRequest,moveCategoryItem} from '@/lib/ad-categories/ordering';
const rows=[{id:1,name:'أ',active:true,order:7},{id:2,name:'ب',active:false,order:7},{id:3,name:'ج',active:true,order:9}];const req={parentId:null,expected:rows.map(({id,order})=>({id,order})),ids:[3,1,2]};
it('reorders all identities including hidden items without changing any metadata',()=>{expect(planCategoryOrder(rows,req)).toEqual([{...rows[2],order:1},{...rows[0],order:2},{...rows[1],order:3}]);expect(rows[0].order).toBe(7);});
it('rejects a stale order snapshot or changed membership before any write',()=>{expect(()=>planCategoryOrder([{...rows[0],order:8},...rows.slice(1)],req)).toThrow();expect(()=>planCategoryOrder(rows.slice(1),req)).toThrow();});
it.each([[1,1,2],[1,2],[1,2,4]].map(ids=>({ids})))('rejects incomplete, duplicate and foreign identity sets %j',({ids})=>{expect(()=>planCategoryOrder(rows,{...req,ids})).toThrow();});
it.each([null,{...req,parentId:-1},{...req,ids:[0]},{...req,expected:[{id:1,order:NaN}]}])('rejects malformed input %j',input=>{expect(()=>validateOrderRequest(input)).toThrow();});
it('moves only the requested item and retains immutable data',()=>{expect(moveCategoryItem(rows,1,3).map(r=>r.id)).toEqual([2,3,1]);expect(moveCategoryItem(rows,1,999)).toEqual(rows);});
