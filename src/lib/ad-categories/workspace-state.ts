import type {CategoryAdminView} from './admin-navigation';
export type WorkspaceSelection={categoryId:number|null;subcategoryId:number|null};
export type WorkspaceTaxonomy={categories:{id:number}[];subcategories:{id:number;categoryId:number}[]};
export function normalizeWorkspaceSelection(s:WorkspaceSelection,t:WorkspaceTaxonomy):WorkspaceSelection{
 if(!t.categories.some(c=>c.id===s.categoryId))return {categoryId:null,subcategoryId:null};
 return {categoryId:s.categoryId,subcategoryId:t.subcategories.some(c=>c.id===s.subcategoryId&&c.categoryId===s.categoryId)?s.subcategoryId:null};
}
export function categoryTaskPath(view:CategoryAdminView,s:WorkspaceSelection){
 const task=view==='display'?'requirements':view;
 if(s.subcategoryId&&(task==='fields'||task==='requirements'))return `/admin/categories?sub=${s.subcategoryId}&section=${task}`;
 if(s.categoryId&&task==='requirements')return `/admin/categories?scope=parent&category=${s.categoryId}&section=requirements`;
 return `/admin/categories?view=${task}${s.categoryId?`&category=${s.categoryId}`:''}${s.subcategoryId?`&subcategory=${s.subcategoryId}`:''}`;
}
export function workspaceRouteKey(href:string){
 if(!/^\/admin\/categories(?:\?|$)/.test(href))return '';
 const u=new URL(href,'https://local.invalid');
 const q=new URLSearchParams();
 for(const k of ['view','scope','sub','section','category','subcategory','page','review'])if(u.searchParams.has(k))q.set(k,u.searchParams.get(k)!);
 q.sort();return '/admin/categories'+(q.size?'?'+q:'');
}
export function workspaceTaskHref(view:CategoryAdminView,s:WorkspaceSelection,routes:Partial<Record<CategoryAdminView,string>>,t:WorkspaceTaxonomy){
 const fallback=categoryTaskPath(view,s),saved=workspaceRouteKey(routes[view]||'');
 if(!saved)return fallback;
 const q=new URL(saved,'https://local.invalid').searchParams;
 const sub=t.subcategories.find(x=>x.id===Number(q.get('sub')||q.get('subcategory')));
 const actual=normalizeWorkspaceSelection({categoryId:Number(q.get('category'))||sub?.categoryId||null,subcategoryId:sub?.id||null},t);
 const task=q.get('sub')||q.get('scope')==='parent'?q.get('section'):q.get('view');
 return task===view&&actual.categoryId===s.categoryId&&actual.subcategoryId===s.subcategoryId?saved:fallback;
}
