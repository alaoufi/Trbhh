export function resolveAdminPageTitle(items:readonly {href:string;label:string}[],pathname:string,search:string):{href:string;label:string}|null{
 const current=new URLSearchParams(search);
 const matches=items.filter(item=>{
  const [path,query]=item.href.split('?');
  if(pathname!==path&&!(path!=='/admin'&&pathname.startsWith(`${path}/`)))return false;
  return [...new URLSearchParams(query)].every(([key,value])=>current.get(key)===value);
 });
 return matches.sort((a,b)=>b.href.split('?')[0].length-a.href.split('?')[0].length||Number(b.href.includes('?'))-Number(a.href.includes('?')))[0]??null;
}
