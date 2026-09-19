import {describe,it,expect} from 'vitest';
import {parseSupplier,parseSupplierProduct} from '@/lib/commerce/supplier-input';
function form(values:Record<string,string|undefined>={}) {const fd=new FormData();for(const [k,v] of Object.entries({name:'مورد اختبار',...values}))if(v!==undefined)fd.set(k,v);return fd;}
describe('supplier configuration boundary',()=>{
  it('defaults profile and API to disabled with no secrets',()=>{
    expect(parseSupplier(form())).toMatchObject({name:'مورد اختبار',active:false,apiEnabled:false,apiBaseUrl:'',apiCredentialRef:''});
  });
  it('can activate manual supplier without activating API',()=>{
    expect(parseSupplier(form({active:'1',apiBaseUrl:'https://supplier.example.com/v1',apiCredentialRef:'TRBHH_SUPPLIER_VENDOR_TOKEN'}))).toMatchObject({active:true,apiEnabled:false,apiBaseUrl:'https://supplier.example.com/v1',apiCredentialRef:'TRBHH_SUPPLIER_VENDOR_TOKEN'});
  });
  it('accepts multiline internal notes and settlement terms without control bytes',()=>{
    expect(parseSupplier(form({notes:'سطر أول\nسطر ثان',settlementTerms:'تسوية أسبوعية\nخارج الموقع'})).notes).toBe('سطر أول\nسطر ثان');
    expect(()=>parseSupplier(form({notes:'ملاحظة\u0000'}))).toThrow();
  });
  it.each(['http://supplier.example.com','https://user:secret@supplier.example.com','https://supplier.example.com?key=secret','https://supplier.example.com/#token','https://127.0.0.1','https://[::1]','https://localhost','https://api.local','https://api.internal','https://supplier.example.com:8443'])('rejects unsafe endpoint %s',url=>{
    expect(()=>parseSupplier(form({apiBaseUrl:url}))).toThrow();
  });
  it.each(['AUTH_SECRET','DATABASE_URL','TRBHH_SUPPLIER_','actual-secret-value'])('rejects non-dedicated secret reference %s',ref=>{
    expect(()=>parseSupplier(form({apiCredentialRef:ref}))).toThrow();
  });
  it('does not accept activation before a provider adapter is reviewed',()=>{
    expect(()=>parseSupplier(form({apiEnabled:'1'}))).toThrow('supplier_api_not_ready');
  });
  it.each([{name:''},{name:'x'.repeat(201)},{email:'not-email'},{phone:'bad-number'},{notes:'x'.repeat(2001)},{name:'abc\nxyz'}])('bounds profile input %#',values=>{
    expect(()=>parseSupplier(form(values))).toThrow();
  });
  it('parses trusted product association amounts in minor units',()=>{
    expect(parseSupplierProduct(form({productId:'12',supplierId:'7',supplierSku:'SKU-22',unitCost:'10.25'}))).toEqual({productId:12n,supplierId:7n,supplierSku:'SKU-22',unitCostMinor:1025});
  });
  it.each([{productId:'1 OR 1=1'},{supplierId:'0'},{unitCost:'1.001'},{unitCost:'-1'},{supplierSku:'x'.repeat(129)}])('rejects malformed associations %#',values=>{
    expect(()=>parseSupplierProduct(form({productId:'12',supplierId:'7',unitCost:'10.25',...values}))).toThrow();
  });
});
