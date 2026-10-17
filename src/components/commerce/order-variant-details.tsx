export function OrderVariantDetails({value}:{value:unknown}){
 let parsed=value;
 if(typeof parsed==='string'){try{parsed=JSON.parse(parsed);}catch{return null;}}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
 const snapshot=parsed as Record<string,unknown>,attributes=snapshot.attributes&&typeof snapshot.attributes==='object'&&!Array.isArray(snapshot.attributes)?Object.entries(snapshot.attributes as Record<string,unknown>).filter((entry):entry is [string,string]=>typeof entry[1]==='string'&&!!entry[1]):[];
 const reference=typeof snapshot.storefrontProductId==='string'?snapshot.storefrontProductId:null,pid=typeof snapshot.pid==='string'?snapshot.pid:null;
 const sku=typeof snapshot.sku==='string'?snapshot.sku:null,vid=typeof snapshot.vid==='string'?snapshot.vid:null;
 if(!reference&&!pid&&!sku&&!vid&&!attributes.length)return null;
 return <div className="mt-1 min-w-0 space-y-1 rounded-lg bg-slate-50 p-2 text-xs">
 {reference&&<p className="font-bold text-primary">رقم المنتج: <bdi>{reference}</bdi></p>}
 {attributes.length>0&&<dl className="grid grid-cols-2 gap-x-3 gap-y-1">{attributes.map(([key,value])=><div key={`${key}-${value}`} className="flex min-w-0 gap-1"><dt className="shrink-0 font-bold text-slate-500">{key}:</dt><dd className="break-words"><bdi>{value}</bdi></dd></div>)}</dl>}
 {(pid||vid||sku)&&<details><summary className="cursor-pointer text-slate-500">تفاصيل المرجع</summary><dl className="mt-1 space-y-1 break-all">{pid&&<div><dt className="inline">معرّف المصدر: </dt><dd className="inline"><bdi>{pid}</bdi></dd></div>}{vid&&<div><dt className="inline">معرّف الخيار: </dt><dd className="inline"><bdi>{vid}</bdi></dd></div>}{sku&&<div><dt className="inline">رمز الخيار: </dt><dd className="inline"><bdi>{sku}</bdi></dd></div>}</dl></details>}
 </div>;
}
