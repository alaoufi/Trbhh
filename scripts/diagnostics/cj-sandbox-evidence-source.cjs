'use strict';
const {inspectSettings,verifyReceiver}=require('./cj-webhook-setup.cjs');
const REF='trbhh-sbx-34b1f44e-cce8-4f12-9986-be0fd1576dde',VID='2610070813191630909',TRACK='TRBHH-SANDBOX-TEST-001';
const DETAIL='/shopping/order/getOrderDetail',SETTINGS='/setting/get';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function failure(reason,endpoint,response,body){const error=Error(reason);Object.assign(error,{reason,endpoint,httpStatus:response?.status??null,providerCode:typeof body?.code==='number'&&Number.isSafeInteger(body.code)?body.code:null,requestId:typeof body?.requestId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(body.requestId)?body.requestId:null});return error;}
/** This transport has no method parameter and cannot issue provider writes. */
function readOnlyTransport(token,fetcher=fetch,wait=sleep){let calls=0;return async(endpoint,params={})=>{
 if(![DETAIL,SETTINGS].includes(endpoint)||++calls>6||!params||typeof params!=='object'||Array.isArray(params)||Object.keys(params).some(k=>k!=='orderId')||endpoint===SETTINGS&&Object.keys(params).length||endpoint===DETAIL&&(Object.keys(params).length!==1||typeof params.orderId!=='string'||params.orderId!==REF&&!/^SD\d{6,60}$/.test(params.orderId)))throw failure('source_endpoint_blocked',endpoint);
 for(let attempt=0;attempt<3;attempt++){
  await wait(attempt?8000*2**(attempt-1):3000);
  const url=new URL('https://developers.cjdropshipping.com/api2.0/v1'+endpoint);if(endpoint===DETAIL)url.searchParams.set('orderId',params.orderId);
  let response,body;
  try{response=await fetcher(url,{method:'GET',headers:{'CJ-Access-Token':token},redirect:'error',signal:AbortSignal.timeout(20000)});body=await response.json();}catch{throw failure('source_read_failed',endpoint,response);}
  if((response.status===429||body?.code===1600200)&&attempt<2)continue;
  if(!response.ok||body?.code!==200||body.result!==true)throw failure('source_api_rejected',endpoint,response,body);
  return body.data;
 }
};}
function validExpected(e){return e?.reference===REF&&typeof e.orderId==='string'&&/^\d{6,60}$/.test(e.orderId)&&typeof e.cjOrderCode==='string'&&/^SD\d{6,60}$/.test(e.cjOrderCode);}
function sameOrder(d,e){return d?.isSandbox===1&&d.orderNum===REF&&d.orderId===e.orderId&&d.cjOrderCode===e.cjOrderCode&&Array.isArray(d.productList)&&d.productList.length===1&&d.productList[0].vid===VID&&Number(d.productList[0].quantity)===1;}
async function inspectSource({token,expected,fetcher=fetch,wait=sleep,report=()=>{}}){
 const api=readOnlyTransport(token,fetcher,wait),raw={},errors={};
 if(validExpected(expected)){
  for(const [name,orderId] of [['referenceRead',REF],['codeRead',expected.cjOrderCode]])try{raw[name]=await api(DETAIL,{orderId});}catch(e){errors[name]=e;}
 }else errors.referenceRead=failure('source_expected_identity_invalid',DETAIL);
 // Settings remain independently diagnosable even when either order lookup fails.
 try{raw.settings=await api(SETTINGS);}catch(e){errors.settings=e;}
 const openId=typeof raw.settings?.openId==='string'?raw.settings.openId:Number.isSafeInteger(raw.settings?.openId)?String(raw.settings.openId):'';
 const secrets=[token,process.env.CJ_API_KEY,openId].filter(v=>typeof v==='string'&&v.length);
 const clean=v=>typeof v==='string'&&secrets.some(secret=>v.includes(secret))?null:v;
 const safeError=e=>({ok:false,issue:['source_endpoint_blocked','source_read_failed','source_api_rejected','source_expected_identity_invalid'].includes(e?.reason)?e.reason:'source_evidence_unavailable',endpoint:[DETAIL,SETTINGS].includes(e?.endpoint)?e.endpoint:null,httpStatus:e?.httpStatus??null,providerCode:e?.providerCode??null,requestId:clean(e?.requestId??null)});
 const fieldNames=value=>value&&typeof value==='object'?Object.keys(value).filter(k=>/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(k)&&clean(k)!==null).sort().slice(0,120):[];
 const orderEvidence=d=>{
  const amounts={};for(const key of ['orderAmount','productAmount','postageAmount','payAmount','orderMoney','refundAmount']){const v=d[key];if(typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e9||typeof v==='string'&&/^\d{1,9}(?:\.\d{1,2})?$/.test(v)){const value=clean(v);if(value!==null)amounts[key]=value;}}
  const safeState=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(v)?clean(v):null;
  const logisticsStatuses={},logisticsStatusPresent={};for(const key of ['logisticStatus','trackingStatus','trackStatus']){logisticsStatusPresent[key]=Object.hasOwn(d,key);if(Object.hasOwn(d,key))logisticsStatuses[key]=typeof d[key]==='number'&&Number.isSafeInteger(d[key])&&Math.abs(d[key])<=100000?d[key]:safeState(d[key]);}
  return {orderId:d.orderId,cjOrderCode:d.cjOrderCode,reference:REF,isSandbox:1,variantMatched:true,quantity:1,status:safeState(d.orderStatus),subStatus:safeState(d.subStatus),paymentDate:typeof d.paymentDate==='string'&&/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?$/.test(d.paymentDate)?clean(d.paymentDate):null,amounts,currency:typeof d.currency==='string'&&/^[A-Z]{3}$/.test(d.currency)?clean(d.currency):null,trackingPresent:typeof d.trackNumber==='string'&&!!d.trackNumber,trackingMatched:d.trackNumber===TRACK,logisticsStatuses,logisticsStatusPresent,sourceFields:fieldNames(d)};
 };
 const order={identityVerified:false};
 for(const name of ['referenceRead','codeRead'])order[name]=errors[name]?safeError(errors[name]):raw[name]&&sameOrder(raw[name],expected)?{ok:true,evidence:orderEvidence(raw[name])}:{ok:false,issue:'source_order_identity_mismatch',sourceFields:fieldNames(raw[name])};
 order.identityVerified=validExpected(expected)&&order.referenceRead.ok===true&&order.codeRead.ok===true;
 let settings=errors.settings?safeError(errors.settings):{ok:true,sourceFields:fieldNames(raw.settings)};
 if(!errors.settings)try{settings.facts=inspectSettings(raw.settings);}catch{settings={...settings,ok:false,issue:'source_callback_shape_invalid'};}
 const receiver={attempted:false,verified:false,issue:null};
 if(/^[1-9]\d{0,63}$/.test(openId)){
  receiver.attempted=true;try{await verifyReceiver(openId,fetcher);receiver.verified=true;}catch{receiver.issue='source_receiver_auth_unverified';}
 }else receiver.issue='source_signing_identity_invalid';
 const result={event:'CJ_SANDBOX_SOURCE_EVIDENCE',order,settings,receiver,realPaymentAttempted:false,configurationWriteAttempted:false};report(result);return result;
}
module.exports={inspectSource,readOnlyTransport};
