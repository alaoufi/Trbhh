export function OrderVariantDetails({value}:{value:unknown}){
 let parsed=value;
 if(typeof parsed==='string'){try{parsed=JSON.parse(parsed);}catch{return null;}}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
 const snapshot=parsed as Record<string,unknown>,attributes=snapshot.attributes&&typeof snapshot.attributes==='object'&&!Array.isArray(snapshot.attributes)?Object.entries(snapshot.attributes as Record<string,unknown>).filter((entry):entry is [string,string]=>typeof entry[1]==='string'&&!!entry[1]):[];
 const reference=typeof snapshot.storefrontProductId==='string'?snapshot.storefrontProductId:null,pid=typeof snapshot.pid==='string'?snapshot.pid:null;
 const sku=typeof snapshot.sku==='string'?snapshot.sku:null,vid=typeof snapshot.vid==='string'?snapshot.vid:null;
 if(!reference&&!pid&&!sku&&!vid&&!attributes.length)return null;
 return <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-slate-50 p-2 text-xs">{reference&&<div className="col-span-2 font-bold text-primary">رقم المنتج في تربح: <bdi>{reference}</bdi></div>}{pid&&<div className="col-span-2 break-all">رقم المنتج لدى المورد: <bdi>{pid}</bdi></div>}{vid&&<div className="flex gap-1"><dt className="font-bold text-slate-500">رقم الخيار لدى المورد:</dt><dd><bdi>{vid}</bdi></dd></div>}{sku&&<div className="flex gap-1"><dt className="font-bold text-slate-500">رمز الخيار:</dt><dd><bdi>{sku}</bdi></dd></div>}{attributes.map(([key,value])=><div key={`${key}-${value}`} className="flex min-w-0 gap-1"><dt className="shrink-0 font-bold text-slate-500">{key}:</dt><dd className="break-words"><bdi>{value}</bdi></dd></div>)}</dl>;
}
