import {CategoryValidationError} from './validation';
export type CategoryOrderItem={id:number;name:string;active:boolean;order:number};
export type CategoryOrderRequest={parentId:number|null;expected:{id:number;order:number}[];ids:number[]};
export type CategoryOrderResult={ok:true;items:CategoryOrderItem[]};
const fail=():never=>{throw new CategoryValidationError('','تغيّرت القائمة أو ترتيبها؛ حدّث القائمة ثم أعد المحاولة');};
const id=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=2147483647;
export function validateOrderRequest(raw:unknown):CategoryOrderRequest{
 if(!raw||typeof raw!=='object')return fail();const r=raw as CategoryOrderRequest;
 if(r.parentId!==null&&!id(r.parentId)||!Array.isArray(r.ids)||!Array.isArray(r.expected)||r.ids.length>2000||r.expected.length!==r.ids.length||r.ids.some(n=>!id(n))||r.expected.some(n=>!n||!id(n.id)||!Number.isSafeInteger(n.order))||new Set(r.ids).size!==r.ids.length||new Set(r.expected.map(n=>n.id)).size!==r.expected.length)return fail();
 return r;
}
export function planCategoryOrder(current:CategoryOrderItem[],raw:unknown):CategoryOrderItem[]{
 const r=validateOrderRequest(raw),byId=new Map(current.map(row=>[row.id,row]));
 if(byId.size!==current.length||current.length!==r.ids.length||r.expected.some(row=>byId.get(row.id)?.order!==row.order)||r.ids.some(n=>!byId.has(n)))return fail();
 return r.ids.map((n,index)=>({...byId.get(n)!,order:index+1}));
}
export function moveCategoryItem<T extends {id:number}>(items:T[],source:number,target:number):T[]{
 const from=items.findIndex(r=>r.id===source),to=items.findIndex(r=>r.id===target);if(from<0||to<0||from===to)return items;
 const next=[...items];const [item]=next.splice(from,1);next.splice(to,0,item);return next;
}
