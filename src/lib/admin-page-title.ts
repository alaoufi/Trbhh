export function resolveAdminPageTitle(items:readonly {href:string;label:string}[],pathname:string,search:string):{href:string;label:string}|null{
 const current=new URLSearchParams(search);
 const target=/^\/admin\/finance\/invoices\/[^/]+$/.test(pathname)?'/admin/finance?section=invoices':/^\/admin\/commerce\/orders\/[^/]+$/.test(pathname)?'/admin/orders':/^\/admin\/suppliers\/cj\/review\/[^/]+$/.test(pathname)?'/admin/suppliers/cj/browse':/^\/admin\/users\/[^/]+\/permissions$/.test(pathname)?'/admin/access-control':null;
 if(target){const page=items.find(item=>item.href===target);if(page)return page;}
 const matches=items.filter(item=>{
  const [path,query]=item.href.split('?');
  if(pathname!==path&&!(path!=='/admin'&&pathname.startsWith(`${path}/`)))return false;
  return [...new URLSearchParams(query)].every(([key,value])=>current.get(key)===value);
 });
 return matches.sort((a,b)=>b.href.split('?')[0].length-a.href.split('?')[0].length||Number(b.href.includes('?'))-Number(a.href.includes('?')))[0]??null;
}
