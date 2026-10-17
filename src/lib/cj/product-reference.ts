export type SupplierProductReference={storefrontProductId:string|null;pid:string;vid:string;quantity:number};
/** Read persisted quote references; never substitute the unrelated commerce product ID. */
export function supplierQuoteReferences(value:unknown):SupplierProductReference[]{
 try{const quote=typeof value==='string'?JSON.parse(value):value;
 if(!quote||typeof quote!=='object'||!Array.isArray(quote.lines)||quote.lines.length>100)return [];
 return quote.lines.flatMap((line:Record<string,unknown>)=>{
 if(!line||typeof line!=='object'||typeof line.pid!=='string'||typeof line.vid!=='string'||![line.pid,line.vid].every(v=>/^[A-Za-z0-9_-]{1,64}$/.test(v))||!Number.isSafeInteger(line.quantity)||Number(line.quantity)<1)return [];
 const storefrontProductId=typeof line.storefrontProductId==='string'&&/^[1-9]\d{0,19}$/.test(line.storefrontProductId)?line.storefrontProductId:null;
 return [{storefrontProductId,pid:line.pid,vid:line.vid,quantity:Number(line.quantity)}];
 });}catch{return [];}
}
