/** Short display snapshots only. Purchase verification must always query CJ. */
export function createDisplayReadCache<T>(ttlMs:number,now=Date.now,maxEntries=200,cacheIf:(value:T)=>boolean=()=>true){
  const settled=new Map<string,{at:number;value:T}>(),pending=new Map<string,Promise<T>>();
  return {read(key:string,load:()=>Promise<T>,refresh=false):Promise<T>{
    const active=pending.get(key);if(active)return active;
    const previous=settled.get(key);
    if(!refresh&&previous&&now()-previous.at<ttlMs&&cacheIf(previous.value))return Promise.resolve(previous.value);
    settled.delete(key);
    const request=load().then(value=>{
      if(cacheIf(value))settled.set(key,{at:now(),value});
      while(settled.size>maxEntries)settled.delete(settled.keys().next().value!);
      return value;
    }).finally(()=>pending.delete(key));
    pending.set(key,request);return request;
  }};
}

export type VerifiedSelection={productId:number;vid:string;quantity:number};
export function quoteMatchesSelection(checked:VerifiedSelection|null,productId:number,vid:string,quantity:number){
  return !!checked&&checked.productId===productId&&checked.vid===vid&&checked.quantity===quantity;
}

export function isLiveDisplayPayload(value:unknown):boolean{
  if(!value||typeof value!=='object')return false;
  const row=value as Record<string,unknown>;
  const integer=(v:unknown,min:number)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
  return row.status==='available'&&integer(row.priceMinor,1)&&integer(row.shipMinor,0)&&integer(row.stock,1)&&integer(row.totalMinor,1)&&row.totalMinor===Number(row.priceMinor)+Number(row.shipMinor)&&typeof row.checkedAt==='string'&&Number.isFinite(Date.parse(row.checkedAt));
}

/** Passive cards use bounded slots; an active variant/quantity check never waits here. */
export function createDisplayReadQueue(concurrency=1){
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw Error('display_concurrency_invalid');
  const tails:Promise<unknown>[]=Array.from({length:concurrency},()=>Promise.resolve());let cursor=0;
  return function schedule<T>(load:()=>Promise<T>):Promise<T>{
    const slot=cursor++%concurrency;const next=tails[slot].then(load,load);tails[slot]=next.then(()=>undefined,()=>undefined);return next;
  };
}
