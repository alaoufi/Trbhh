import 'server-only';
import {parseSar} from '@/lib/commerce/money';
import {saudiCommercePhone} from '@/lib/commerce/config';
import type {SupplierAdapter,SupplierProduct,SupplierOrder,SupplierShipment,SupplierCreateOrderResult,SupplierOrderRequest} from '../types';

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
  private async request(method:'GET'|'POST',path:string,payload?:Obj):Promise<Obj|null>{
    const token=await this.token();
    let response:Response;
    const headers:Record<string,string>={Authorization:`Bearer ${token}`,Accept:'application/json'};
    if(payload)headers['Content-Type']='application/json';
    try{response=await this.fetcher(BASE+path,{method,headers,body:payload?JSON.stringify(payload):undefined,credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{throw new Error('salla_request_failed');}
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
  private get(path:string){return this.request('GET',path);}
  private post(path:string,payload:Obj){return this.request('POST',path,payload);}
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
  async createOrder(request:SupplierOrderRequest):Promise<SupplierCreateOrderResult>{
    if(request.currency!=='SAR'||!request.items.length||request.items.length>100)throw new Error('salla_order_contract');
    // A product variant cannot safely be represented by product id alone. Keep
    // this closed until immutable Salla option/value ids are captured in the snapshot.
    if(request.items.some(item=>item.variantId||item.hasVariants))throw new Error('salla_variant_order_contract_required');
    const normalized=saudiCommercePhone(request.shipping.phone);
    if(!normalized)throw new Error('salla_customer_phone');
    const local=normalized.slice(3),keyword=encodeURIComponent(local);
    const customers=await this.get(`/customers?keyword=${keyword}&page=1&per_page=30`);
    if(!customers||!Array.isArray(customers.data)||customers.data.length>30)throw new Error('salla_customers_unavailable');
    let customerId:string|undefined;
    for(const value of customers.data){
      const customer=object(value),mobile=String(customer.mobile??'').replace(/\D/g,''),code=String(customer.mobile_code??'').replace(/\D/g,'');
      const candidate=mobile.startsWith('966')?mobile:code==='966'?`966${mobile.replace(/^0/,'')}`:mobile.startsWith('05')?`966${mobile.slice(1)}`:mobile.length===9?`966${mobile}`:'';
      if(candidate===normalized){customerId=id(customer.id);break;}
    }
    if(!customerId){
      const names=request.shipping.name.trim().split(/\s+/).filter(Boolean),first=names.shift()||'عميل',last=names.join(' ')||first;
      const created=await this.post('/customers',{first_name:first.slice(0,100),last_name:last.slice(0,100),mobile:Number(local),mobile_code_country:'+966'});
      if(!created)throw new Error('salla_customer_create_failed');
      customerId=id(object(created.data).id);
    }
    let cityId:string|undefined,countryId:string|undefined;
    for(let page=1;page<=100&&!cityId;page++){
      const cities=await this.get(`/countries/SA/cities?page=${page}&per_page=100`);
      if(!cities||!Array.isArray(cities.data)||cities.data.length>100)throw new Error('salla_cities_unavailable');
      const country=object(cities.country);if(text(country.code,2)!=='SA')throw new Error('salla_country_mismatch');
      countryId=id(country.id);
      for(const value of cities.data){const city=object(value);if(text(city.name,120).trim()===request.shipping.city.trim()){cityId=id(city.id);if(id(city.country_id)!==countryId)throw new Error('salla_country_mismatch');break;}}
      if(cityId)break;
      if(!pagination(cities,page))break;
    }
    if(!cityId||!countryId)throw new Error('salla_city_not_found');
    const products=request.items.map(item=>{
      const identifier=Number(id(item.externalId));if(!Number.isSafeInteger(identifier))throw new Error('salla_invalid_id');
      if(!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>100000)throw new Error('salla_order_contract');
      return {identifier_type:'id',identifier,quantity:item.quantity};
    });
    const body=await this.post('/orders',{
      customer:{id:Number(customerId)},
      receiver:{name:request.shipping.name.trim().slice(0,191),phone:normalized,country_code:'SA',notify:false},
      delivery_method:'shipping',
      ship_to:{country:Number(countryId),city:Number(cityId),address:request.shipping.addressLine.trim().slice(0,500),postal_code:request.shipping.postalCode.trim().slice(0,20)},
      payment:{status:'paid'},products,
    });
    if(!body)throw new Error('salla_order_create_failed');
    const order=object(body.data),externalOrderId=id(order.id),returnedCustomer=id(object(order.customer).id);
    if(returnedCustomer!==customerId)throw new Error('salla_resource_mismatch');
    const externalOrderUrl=text(object(order.urls).admin,2048);
    let url:URL;try{url=new URL(externalOrderUrl);}catch{throw new Error('salla_invalid_response');}
    if(url.protocol!=='https:'||url.hostname!=='s.salla.sa'||!url.pathname.startsWith('/orders/order/')||url.username||url.password||url.port)throw new Error('salla_invalid_response');
    return {status:'submitted',externalOrderId,externalOrderUrl:url.href,externalCustomerId:customerId};
  }
}
