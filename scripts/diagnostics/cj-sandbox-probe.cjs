// Isolated external sandbox probe. Never imports production dispatch/payment workers.
'use strict';
const {randomUUID}=require('node:crypto');
const ORIGIN='https://developers.cjdropshipping.com/api2.0/v1';
function sandboxPayload({reference,productId,vid,logisticName}){
 if(!/^trbhh-sbx-[a-f0-9-]{36}$/.test(reference)||!/^[1-9]\d{0,19}$/.test(productId)||!/^[A-Za-z0-9_-]{1,64}$/.test(vid)||typeof logisticName!=='string'||!logisticName||logisticName.length>50)throw Error('sandbox_input_invalid');
 return {isSandbox:1,payType:3,orderFlow:1,shopLogisticsType:2,orderNumber:reference,shippingCountry:'Saudi Arabia',shippingCountryCode:'SA',shippingProvince:'Riyadh',shippingCity:'Al Majmaah',shippingCustomerName:'TRBHH SANDBOX TEST',shippingAddress:'Sandbox integration test only - no real delivery',shippingZip:'15365',fromCountryCode:'CN',logisticName,products:[{vid,quantity:1,storeProductId:productId,storeLineItemId:reference+'-'+productId}]};
}
async function probe({productId,pid,vid,api,reference='trbhh-sbx-'+randomUUID()}){
 if(!/^[1-9]\d{0,19}$/.test(productId)||!/^[A-Za-z0-9_-]{1,64}$/.test(pid)||!/^[A-Za-z0-9_-]{1,64}$/.test(vid))throw Error('sandbox_input_invalid');
 const source=await api('/product/query','GET',{pid});
 if(source?.pid!==pid||!Array.isArray(source.variants)||!source.variants.some(v=>v.vid===vid))throw Error('sandbox_variant_identity_invalid');
 const routes=await api('/logistic/freightCalculate','POST',{startCountryCode:'CN',endCountryCode:'SA',zipCode:'15365',products:[{vid,quantity:1}]});
 if(!Array.isArray(routes)||!routes.length)throw Error('sandbox_routes_unavailable');
 const route=routes.find(r=>typeof r.logisticName==='string'&&r.logisticName.trim()&&Number.isFinite(Number(r.logisticPrice))&&Number(r.logisticPrice)>=0);if(!route)throw Error('sandbox_routes_unavailable');
 const payload=sandboxPayload({reference,productId,vid,logisticName:route.logisticName});
 // One create attempt only: ambiguous network outcomes must not be retried.
 const result=await api('/shopping/order/createOrderV3','POST',payload);
 if(typeof result?.orderId!=='string'||!result.orderId||result.orderNumber!==reference)throw Error('sandbox_create_identity_unverified');
 const detail=await api('/shopping/order/getOrderDetail','GET',{orderId:result.orderId});
 if(detail?.isSandbox!==1||detail.orderId!==result.orderId||detail.orderNum!==reference)throw Error('sandbox_readback_unverified');
 const lines=detail.productList;
 if(!Array.isArray(lines)||lines.length!==1||lines[0].vid!==vid||Number(lines[0].quantity)!==1)throw Error('sandbox_line_readback_unverified');
 return {event:'CJ_SANDBOX_VERIFIED',reference,productId,pid,vid,orderId:result.orderId,isSandbox:detail.isSandbox,status:detail.orderStatus,variantAndQuantityMatched:true,realPaymentAttempted:false,realFulfillmentRequested:false,productionOrderCreated:false};
}
function safeProviderMessage(value,token){if(typeof value!=='string')return null;return value.split(token).join('[REDACTED]').replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/[A-Za-z0-9_+\/=-]{32,}/g,'[REDACTED]').replace(/[\r\n\x00-\x1f]+/g,' ').slice(0,300);}
async function readOnlyProbe(input){
 try{await probe({...input,api:async(path,method,body)=>{if(path.startsWith('/shopping/'))throw Error('sandbox_readonly_complete');return input.api(path,method,body);}});}catch(e){if(e.message!=='sandbox_readonly_complete')throw e;}
 return {event:'CJ_SANDBOX_READS_VERIFIED',productId:input.productId,pid:input.pid,vid:input.vid,orderCreationAttempted:false,realPaymentAttempted:false};
}
function guardedApi(token,fetcher=fetch){let last=0,createSent=false,calls=0;return async(path,method,body)=>{
 const allowed={'/product/query':'GET','/logistic/freightCalculate':'POST','/shopping/order/createOrderV3':'POST','/shopping/order/getOrderDetail':'GET'};
 if(allowed[path]!==method||++calls>4)throw Error('sandbox_endpoint_blocked');
 if(path==='/shopping/order/createOrderV3'){if(createSent||body.isSandbox!==1||body.payType!==3||body.products?.length!==1)throw Error('sandbox_create_blocked');createSent=true;}
 const delay=1600-(Date.now()-last);if(delay>0)await new Promise(r=>setTimeout(r,delay));last=Date.now();
 const url=new URL(ORIGIN+path);if(method==='GET')for(const[k,v]of Object.entries(body))url.searchParams.set(k,v);
 const response=await fetcher(url,{method,headers:{'Content-Type':'application/json','CJ-Access-Token':token},...(method==='POST'?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
 let data;try{data=await response.json();}catch{const e=Error('sandbox_response_invalid');e.endpoint=path;e.httpStatus=response.status;throw e;}
 if(!response.ok||data?.code!==200||data?.result!==true){const e=Error('sandbox_api_rejected');e.endpoint=path;e.httpStatus=response.status;e.providerMessage=safeProviderMessage(data.message,token);e.providerCode=typeof data.code==='number'?data.code:null;e.requestId=typeof data.requestId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(data.requestId)?data.requestId:null;throw e;}return data.data;
 };}
async function main(){const {PrismaClient}=require('@prisma/client'),{decryptToken}=require('./cj-catalog-audit.cjs'),db=new PrismaClient({log:[]});let stage='initial';const reference='trbhh-sbx-'+randomUUID();
 try{const productId=process.argv[2],vid=process.argv[3];if(!/^[1-9]\d{0,14}$/.test(productId||'')||!/^[A-Za-z0-9_-]{1,64}$/.test(vid||''))throw Error('sandbox_input_invalid');
 const rows=await db.$queryRawUnsafe('SELECT id,cj_product_id FROM cj_products WHERE id=? LIMIT 1',BigInt(productId));if(rows.length!==1)throw Error('sandbox_product_missing');
 const [auth]=await db.$queryRawUnsafe('SELECT sealed_tokens,access_expires_at FROM cj_auth WHERE id=1 LIMIT 1');const token=decryptToken(auth,process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY);
 stage='external_sandbox';console.log(JSON.stringify({event:'CJ_SANDBOX_BEGIN',reference,productId,vid,readOnly:process.argv[4]==='--read-only',isSandbox:1,payType:3,automaticRetry:false}));console.log(JSON.stringify(await (process.argv[4]==='--read-only'?readOnlyProbe:probe)({productId,pid:rows[0].cj_product_id,vid,reference,api:guardedApi(token)})));
 }catch(e){console.log(JSON.stringify({event:'CJ_SANDBOX_NOT_VERIFIED',reference,stage,reason:/^sandbox_[A-Za-z0-9_]+$/.test(e.message)?e.message:'sandbox_stopped',endpoint:e.endpoint??null,providerMessage:e.providerMessage??null,providerCode:e.providerCode??null,requestId:e.requestId??null,automaticRetry:false,realPaymentAttempted:false}));process.exitCode=1;}finally{await db.$disconnect();}}
function isOrderAbsent(e){return e?.endpoint==='/shopping/order/getOrderDetail'&&e.httpStatus===400&&[1603000,1603100].includes(e.providerCode)&&/^order not found$/i.test(e.providerMessage?.trim()||'');}
module.exports={sandboxPayload,probe,guardedApi,readOnlyProbe,safeProviderMessage,isOrderAbsent};
if(require.main===module)main();
