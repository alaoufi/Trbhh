type ProductSectionLink={id:string;label:string};
/** Native anchors keep every product section readable without JavaScript or hidden tabs. */
export function ProductSectionNav({items}:{items:ProductSectionLink[]}){
 const seen=new Set<string>();
 const links=items.filter(item=>{if(!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(item.id)||!item.label.trim()||seen.has(item.id))return false;seen.add(item.id);return true;});
 if(!links.length)return null;
 return <nav aria-label="أقسام المنتج" data-product-section-nav className="my-5 min-w-0 rounded-2xl border border-primary/15 bg-white p-2 shadow-sm"><ul className="flex min-w-0 flex-wrap gap-1">{links.map(item=><li key={item.id}><a href={`#${item.id}`} className="inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-bold text-primary transition hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{item.label}</a></li>)}</ul></nav>;
}
