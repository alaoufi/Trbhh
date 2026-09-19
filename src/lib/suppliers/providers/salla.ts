import 'server-only';
import {parseSar} from '@/lib/commerce/money';
import type {SupplierAdapter,SupplierProduct,SupplierOrder,SupplierShipment,SupplierCreateOrderResult} from '../types';

const BASE='https://api.salla.dev/admin/v2';
type Obj=Record<string,unknown>;
function object(value:unknown):Obj {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('salla_invalid_response');
  return value as Obj;
}
function list(value:unknown):unknown[] {
  if(value===undefined||value===null)return [];
  if(!Array.isArray(value)||value.length>1000)throw new Error('salla_invalid_response');
  return value;
}
function text(value:unknown,max=255):string {
  if(value===undefined||value===null)return '';
  if(typeof value!=='string'||value.length>max)throw new Error('salla_invalid_response');
  return value;
}
function id(value:unknown):string {
  if(typeof value==='number'&&!Number.isSafeInteger(value))throw new Error('salla_invalid_id');
  const result=String(value);
  if(!/^[1-9]\d{0,29}$/.test(result))throw new Error('salla_invalid_id');
  return result;
}
function quantity(value:unknown):number|null {
  if(value===null||value===undefined)return null;
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>2147483647)throw new Error('salla_invalid_quantity');
  return value;
}
function money(value:unknown):number {
  const price=object(value);
  if(price.currency!=='SAR')throw new Error('salla_unsupported_currency');
  if(typeof price.amount!=='number'&&typeof price.amount!=='string')throw new Error('salla_invalid_price');
  try{return parseSar(String(price.amount));}catch{throw new Error('salla_invalid_price');}
}
function plain(value:unknown):string {
  return text(value,200000).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'')
    .replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g,e=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[e]??''))
    .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,15000);
}
function imageUrl(value:unknown):string|null {
  if(typeof value!=='string'||value.length>2048)return null;
  try{
    const u=new URL(value);
    // Only known Salla media origins; imported URLs may later be fetched by an image optimizer.
    const host=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||u.username||u.password||u.port||!(host==='cdn.salla.sa'||host.endsWith('.cdn.salla.sa')||host==='salla-dev.s3.eu-central-1.amazonaws.com'))return null;
    u.hash='';return u.href;
  }catch{return null;}
}
function timestamp(value:unknown):string|null {
  if(value===undefined||value===null)return null;
  // Product examples expose wall-clock strings without a zone. Do not fabricate UTC.
  if(typeof value==='string'&&/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d{1,6})?$/.test(value))return null;
  let input:unknown=value;
  if(typeof value==='object'){
    const date=object(value);
    const zone=date.timezone==='Asia/Riyadh'?'+03:00':date.timezone==='UTC'?'Z':null;
    if(!zone||typeof date.date!=='string')throw new Error('salla_invalid_timestamp');
    input=date.date.replace(' ','T').replace(/(\.\d{3})\d+$/,'$1')+zone;
  }
  if(typeof input!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(input))throw new Error('salla_invalid_timestamp');
  const date=new Date(input);if(!Number.isFinite(date.getTime()))throw new Error('salla_invalid_timestamp');
  return date.toISOString();
}

/** Whitelist source fields only: provider cost/customer data never enter this DTO. */
export function mapSallaProduct(value:unknown):SupplierProduct {
  const p=object(value),rawOptions=list(p.options).map(object);
  const options=rawOptions.map(o=>({externalId:id(o.id),name:text(o.name),values:list(o.values).map(v=>text(object(v).name))}));
  const variants=list(p.skus).map(value=>{
    const v=object(value),selected:Record<string,string>={};
    const optionIds=list(v.related_options).map(id),valueIds=list(v.related_option_values).map(id);
    optionIds.forEach((oid,i)=>{
      const option=rawOptions.find(o=>id(o.id)===oid);
      const val=option&&list(option.values).map(object).find(v=>id(v.id)===valueIds[i]);
      if(option&&val)Object.defineProperty(selected,text(option.name),{value:text(val.name),enumerable:true});
    });
    const stock=v.unlimited_quantity===true?null:quantity(v.stock_quantity);
    return {externalId:id(v.id),sku:text(v.sku,191),name:text(v.name)||Object.values(selected).join(' / '),publicPriceMinor:v.price==null?null:money(v.price),quantity:stock,available:p.is_available===true&&p.status==='sale'&&(stock===null||stock>0),options:selected};
  });
  const stock=p.unlimited_quantity===true?null:quantity(p.quantity);
  const name=text(p.name);if(!name.trim())throw new Error('salla_invalid_product');
  return {externalId:id(p.id),sku:text(p.sku,191),name,description:plain(p.description),
    images:[...new Set(list(p.images).map(v=>imageUrl(object(v).url)).filter((v):v is string=>v!==null))],
    variants,options,categories:list(p.categories).map(v=>{const c=object(v);return {externalId:id(c.id),name:text(c.name)};}),
    brand:p.brand?text(object(p.brand).name):'',publicPriceMinor:money(p.price),currency:'SAR',quantity:stock,
    available:p.is_available===true&&p.status==='sale'&&(stock===null||stock>0),sourceUpdatedAt:timestamp(p.updated_at)};
}

function pagination(body:Obj,page:number):string|null {
  const p=object(body.pagination);
  if(p.currentPage!==page||!Number.isSafeInteger(p.totalPages)||Number(p.totalPages)<0||Number(p.totalPages)>10000||page>Math.max(1,Number(p.totalPages)))throw new Error('salla_pagination');
  return page<Number(p.totalPages)?String(page+1):null;
}

export class SallaAdapter implements SupplierAdapter {
  readonly provider='salla' as const;
  constructor(private readonly token:()=>Promise<string>,private readonly fetcher:typeof fetch=fetch){}
  private async get(path:string):Promise<Obj|null>{
    const token=await this.token();
    let response:Response;
    try{response=await this.fetcher(BASE+path,{method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{throw new Error('salla_request_failed');}
    if(response.status===404)return null;
    if(!response.ok)throw new Error(`salla_http_${response.status}`);
    const reader=response.body?.getReader();if(!reader)throw new Error('salla_invalid_response');
    const chunks:Uint8Array[]=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();throw new Error('salla_response_too_large');}chunks.push(value);}}
    catch(error){if(error instanceof Error&&error.message==='salla_response_too_large')throw error;throw new Error('salla_response_read_failed');}
    let body:Obj;
    try{body=object(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{throw new Error('salla_invalid_response');}
    if(body.success!==true)throw new Error('salla_response_failed');
    return body;
  }
  async getProducts(input:{cursor?:string|null;limit?:number;updatedSince?:string|null}={}){
    if(input.updatedSince)throw new Error('salla_updated_since_unsupported');
    const cursor=input.cursor??'1',limit=input.limit??50;
    if(!/^[1-9]\d{0,3}$/.test(cursor)||!Number.isInteger(limit)||limit<1||limit>60)throw new Error('salla_pagination');
    const page=Number(cursor),body=await this.get(`/products?page=${page}&per_page=${limit}`);
    if(!body)throw new Error('salla_catalog_unavailable');
    if(!Array.isArray(body.data)||body.data.length>limit)throw new Error('salla_invalid_response');
    let nextCursor:string|null;try{nextCursor=pagination(body,page);}catch{throw new Error('salla_pagination');}
    return {products:body.data.map(mapSallaProduct),nextCursor};
  }
  async getProduct(externalId:string){
    const body=await this.get(`/products/${id(externalId)}`);
    if(!body)return null;
    const product=mapSallaProduct(body.data);if(product.externalId!==externalId)throw new Error('salla_resource_mismatch');return product;
  }
  async getOrder(externalId:string):Promise<SupplierOrder|null>{
    const orderId=id(externalId),body=await this.get(`/orders/${orderId}`);if(!body)return null;
    const order=object(body.data);if(id(order.id)!==orderId)throw new Error('salla_resource_mismatch');
    if(order.currency!=='SAR')throw new Error('salla_unsupported_currency');
    const shipments:SupplierShipment[]=[];
    for(let page=1;page<=10;page++){
      const response=await this.get(`/shipments?order_id=${orderId}&page=${page}&per_page=60`);
      if(!response||!Array.isArray(response.data)||response.data.length>60)throw new Error('salla_shipments_unavailable');
      for(const value of response.data){const s=object(value);if(id(s.order_id)!==orderId)throw new Error('salla_resource_mismatch');
        shipments.push({externalId:id(s.id),carrier:text(s.courier_name,120),trackingNumber:text(s.tracking_number,191),status:text(s.status,40),fulfillmentStatus:text(order.shipping_status,40),sourceUpdatedAt:timestamp(s.updated_at)});
      }
      if(!pagination(response,page))return {externalId:orderId,status:text(object(order.status).slug,40),paymentStatus:text(order.payment_status,32)||'unknown',currency:'SAR',payableMinor:money(object(order.amounts).total),shipments,sourceUpdatedAt:timestamp(order.updated_at)};
    }
    throw new Error('salla_shipments_page_limit');
  }
  async createOrder():Promise<SupplierCreateOrderResult>{throw new Error('unsupported_live_order_contract');}
}
