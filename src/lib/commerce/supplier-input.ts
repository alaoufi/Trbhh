import {isIP} from 'node:net';
import {parseSar} from './money';

function text(fd:FormData,key:string,max:number,required=false,multiline=false):string {
  const raw=fd.get(key);
  if(raw!==null&&typeof raw!=='string')throw new Error('invalid_supplier');
  const value=(raw??'').trim();
  const controls=multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/;
  if((required&&!value)||value.length>max||controls.test(value))throw new Error('invalid_supplier');
  return value;
}
function endpoint(value:string):string {
  if(!value)return '';
  const url=new URL(value);
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port
    ||isIP(host.replace(/^\[|\]$/g,''))||!host.includes('.')||host.endsWith('.')
    ||/(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host)
    ||!/^[a-z0-9.-]+$/.test(host))throw new Error('invalid_supplier_endpoint');
  // Configuration only. A future adapter MUST also enforce DNS/IP validation,
  // destination allowlists and no redirects before making any network request.
  return url.href;
}
export function parseSupplier(fd:FormData) {
  if(fd.get('apiEnabled')==='1')throw new Error('supplier_api_not_ready');
  const name=text(fd,'name',200,true),contactName=text(fd,'contactName',150);
  const phone=text(fd,'phone',40),email=text(fd,'email',254);
  if(phone&&!/^\+?[0-9 ()-]{5,40}$/.test(phone))throw new Error('invalid_supplier_phone');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('invalid_supplier_email');
  const apiCredentialRef=text(fd,'apiCredentialRef',100);
  if(apiCredentialRef&&!/^TRBHH_SUPPLIER_[A-Z][A-Z0-9_]{0,79}$/.test(apiCredentialRef))throw new Error('invalid_supplier_credential_reference');
  return {name,contactName,phone,email,address:text(fd,'address',500,false,true),registrationNumber:text(fd,'registrationNumber',100),
    taxNumber:text(fd,'taxNumber',100),settlementTerms:text(fd,'settlementTerms',2000,false,true),notes:text(fd,'notes',2000,false,true),
    active:fd.get('active')==='1',apiBaseUrl:endpoint(text(fd,'apiBaseUrl',500)),apiCredentialRef,apiEnabled:false as const};
}
export function parseSupplierProduct(fd:FormData) {
  const productId=text(fd,'productId',15,true),supplierId=text(fd,'supplierId',15,true);
  if(!/^[1-9]\d{0,14}$/.test(productId)||!/^[1-9]\d{0,14}$/.test(supplierId))throw new Error('invalid_supplier_product');
  return {productId:BigInt(productId),supplierId:BigInt(supplierId),supplierSku:text(fd,'supplierSku',128),unitCostMinor:parseSar(text(fd,'unitCost',30,true))};
}
