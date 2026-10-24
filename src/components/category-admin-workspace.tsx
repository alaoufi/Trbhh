'use client';
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import type {CategoryAdminView} from '@/lib/ad-categories/admin-navigation';
import {normalizeWorkspaceSelection,workspaceRouteKey,workspaceTaskHref,type WorkspaceSelection,type WorkspaceTaxonomy} from '@/lib/ad-categories/workspace-state';
type Snapshot={y:number;details:boolean[];anchor?:string;offset?:number};
type Memory={selection:WorkspaceSelection;pages:Record<string,Snapshot>;routes:Partial<Record<CategoryAdminView,string>>};
type Context=WorkspaceSelection&{selectCategory:(id:number|null)=>void;selectSubcategory:(id:number|null)=>void;taskHref:(v:CategoryAdminView)=>string};
const Workspace=createContext<Context|null>(null);
export const useCategoryWorkspace=()=>useContext(Workspace);
export function CategoryAdminWorkspace({children,taxonomy,initial,visitKey,renderKey,storageKey}:{children:ReactNode;taxonomy:WorkspaceTaxonomy;initial:WorkspaceSelection;visitKey:string;renderKey:string;storageKey:string}){
 const root=useRef<HTMLDivElement>(null),busy=useRef(true),key=workspaceRouteKey(visitKey);
 const lastAnchor=useRef<HTMLElement|null>(null);
 const memory=useRef<Memory>({selection:initial,pages:{},routes:{}});
 const [selection,setSelection]=useState(initial);
 const persist=()=>{try{sessionStorage.setItem(storageKey,JSON.stringify(memory.current));}catch{}};
 const select=(next:WorkspaceSelection)=>{const clean=normalizeWorkspaceSelection(next,taxonomy);memory.current.selection=clean;setSelection(clean);persist();};
 const capture=()=>{
  if(busy.current||!root.current)return;
  const focused=document.activeElement?.closest<HTMLElement>('[data-category-field]');
  if(focused)lastAnchor.current=focused;
  const active=lastAnchor.current?.isConnected?lastAnchor.current:null;
  memory.current.pages[key]={y:window.scrollY,details:Array.from(root.current.querySelectorAll('details')).map(d=>d.open),...(active?{anchor:active.dataset.categoryField,offset:active.getBoundingClientRect().top}:{})};
  const pages=Object.keys(memory.current.pages);if(pages.length>30)delete memory.current.pages[pages[0]];
  persist();
 };
 useEffect(()=>{
  busy.current=true;
  try{const raw=sessionStorage.getItem(storageKey);if(raw&&raw.length<200000){const m=JSON.parse(raw);if(m&&typeof m.pages==='object'&&m.pages&&typeof m.routes==='object'&&m.routes)memory.current={selection:normalizeWorkspaceSelection(m.selection||initial,taxonomy),pages:m.pages,routes:m.routes};}}catch{}
  const explicit=initial.categoryId!==null;
  const previous=memory.current.selection;
  const chosen=explicit?normalizeWorkspaceSelection({...initial,subcategoryId:initial.subcategoryId??(initial.categoryId===previous.categoryId?previous.subcategoryId:null)},taxonomy):normalizeWorkspaceSelection(previous,taxonomy);
  memory.current.selection=chosen;setSelection(chosen);
  const q=new URL(visitKey,'https://local.invalid').searchParams;
  const task=(q.get('sub')||q.get('scope')==='parent'?q.get('section'):q.get('view')) as CategoryAdminView|null;
  if(task)memory.current.routes[task]=key;
  let frame=0;
  frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
   const snap=memory.current.pages[key];
   if(snap&&Array.isArray(snap.details)){
    root.current?.querySelectorAll('details').forEach((d,i)=>{if(typeof snap.details[i]==='boolean')d.open=snap.details[i];});
    const anchor=snap.anchor?Array.from(root.current?.querySelectorAll<HTMLElement>('[data-category-field]')||[]).find(e=>e.dataset.categoryField===snap.anchor):null;
    window.scrollTo(0,anchor&&Number.isFinite(snap.offset)?window.scrollY+anchor.getBoundingClientRect().top-snap.offset!:Math.max(0,Number(snap.y)||0));
   }
   busy.current=false;persist();
  });});
  const scroll=()=>capture();const leave=()=>capture();
  window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('pagehide',leave);
  return ()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',scroll);window.removeEventListener('pagehide',leave);};
 // New server renders include repeated saves to the same URL.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[visitKey,renderKey,storageKey]);
 const before=()=>{capture();busy.current=true;};
 return <Workspace.Provider value={{...selection,selectCategory:id=>select({categoryId:id,subcategoryId:null}),selectSubcategory:id=>select({...memory.current.selection,subcategoryId:id}),taskHref:v=>workspaceTaskHref(v,selection,memory.current.routes,taxonomy)}}><div ref={root} onSubmitCapture={before} onClickCapture={e=>{const target=e.target as HTMLElement;if(target.closest('a[href]'))before();if(target.closest('summary')){const d=target.closest<HTMLElement>('details');if(d?.dataset.categorySub)select({categoryId:Number(d.dataset.categoryParent),subcategoryId:Number(d.dataset.categorySub)});else if(d?.dataset.categoryMain)select({categoryId:Number(d.dataset.categoryMain),subcategoryId:null});}}} onPointerDownCapture={()=>{busy.current=false;}} onKeyDownCapture={()=>{busy.current=false;}} onFocusCapture={capture} onChangeCapture={e=>{const t=e.target;if(t instanceof HTMLSelectElement){if(t.name==='category')select({categoryId:Number(t.value)||null,subcategoryId:null});if(t.name==='subcategory')select({...memory.current.selection,subcategoryId:Number(t.value)||null});}}}>{children}</div></Workspace.Provider>;
}
