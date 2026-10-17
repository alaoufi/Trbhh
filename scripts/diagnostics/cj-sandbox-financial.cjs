'use strict';
const REFERENCE='trbhh-sbx-34b1f44e-cce8-4f12-9986-be0fd1576dde';
const VID='2610070813191630909',TRACK='TRBHH-SANDBOX-TEST-001';
const {safeProviderMessage}=require('./cj-sandbox-probe.cjs');
function identity(d,first){
 if(d?.isSandbox!==1||d.orderNum!==REFERENCE||typeof d.orderId!=='string'||!d.orderId||
  !Array.isArray(d.productList)||d.productList.length!==1||
  d.productList[0].vid!==VID||Number(d.productList[0].quantity)!==1||
  (first&&(d.orderId!==first.orderId||d.cjOrderCode!==first.cjOrderCode)))throw Error('sandbox_identity_invalid');
 if(!/^SD\d{6,60}$/.test(d.cjOrderCode||''))throw Error('sandbox_source_order_code_missing');
 return d;
}
async function sandboxFinancialProbe({api,claimOnce,report=()=>{}}){
 const first=identity(await api('/shopping/order/getOrderDetail','GET',{orderId:REFERENCE}));
 const code=first.cjOrderCode;
 // Independent query of the exact SD code: never guess or construct it from numeric IDs.
 let d=identity(await api('/shopping/order/getOrderDetail','GET',{orderId:code}),first);
 report({event:'CJ_SANDBOX_IDENTIFIED',reference:REFERENCE,orderId:d.orderId,cjOrderCode:code,status:d.orderStatus});
 await claimOnce();
 const read=async()=>identity(await api('/shopping/order/getOrderDetail','GET',{orderId:REFERENCE}),first);
 if(['CREATED','IN_CART','UNPAID'].includes(d.orderStatus)){
  if(await api('/shopping/sandbox/simulatePay','POST',{orderId:code})!==true)throw Error('sandbox_payment_response_invalid');
  d=await read();
 }
 if(!['PENDING','PROCESSING','UNSHIPPED','SHIPPED','DELIVERED'].includes(d.orderStatus))throw Error('sandbox_paid_status_unverified');
 report({event:'CJ_SANDBOX_PAYMENT_VERIFIED',cjOrderCode:code,status:d.orderStatus,realPaymentAttempted:false});
 if(d.trackNumber!==TRACK){
  if(await api('/shopping/sandbox/updateTrackNumber','POST',{orderId:code,trackNumber:TRACK})!==true)throw Error('sandbox_tracking_response_invalid');
  d=await read();
 }
 if(d.trackNumber!==TRACK)throw Error('sandbox_tracking_readback_invalid');
 return {event:'CJ_SANDBOX_PAYMENT_TRACKING_VERIFIED',reference:REFERENCE,cjOrderCode:code,orderId:d.orderId,trackNumber:d.trackNumber,status:d.orderStatus,refundVerified:false,refundReason:'no_documented_sandbox_refund_endpoint',realPaymentAttempted:false,realFulfillmentRequested:false};
}
function financialTransport(token,fetcher=fetch){let last=0,calls=0;const sent=new Set();return async(path,method,body)=>{
 const allowed={'/shopping/order/getOrderDetail':'GET','/shopping/sandbox/simulatePay':'POST','/shopping/sandbox/updateTrackNumber':'POST'};
 if(allowed[path]!==method||++calls>8)throw Error('sandbox_endpoint_blocked');
 if(method==='GET'&&body.orderId!==REFERENCE&&!/^SD\d{6,60}$/.test(body.orderId||''))throw Error('sandbox_lookup_blocked');
 if(method==='POST'){
  if(!/^SD\d{6,60}$/.test(body.orderId||'')||sent.has(path)||
   (path.endsWith('updateTrackNumber')&&body.trackNumber!==TRACK)||
   Object.keys(body).some(k=>!['orderId','trackNumber'].includes(k)))throw Error('sandbox_mutation_blocked');
  sent.add(path);
 }
 for(let attempt=0;attempt<3;attempt++){
 const wait=3000-(Date.now()-last);if(wait>0)await new Promise(r=>setTimeout(r,wait));last=Date.now();
 const url=new URL('https://developers.cjdropshipping.com/api2.0/v1'+path);
 if(method==='GET')url.searchParams.set('orderId',body.orderId);
 const r=await fetcher(url,{method,headers:{'CJ-Access-Token':token,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
 const j=await r.json();
 if(method==='GET'&&(r.status===429||j.code===1600200)&&attempt<2){await new Promise(resolve=>setTimeout(resolve,4000*2**attempt));continue;}
 if(!r.ok||j.code!==200||j.result!==true){const e=Error('sandbox_api_rejected');Object.assign(e,{endpoint:path,httpStatus:r.status,providerCode:j.code,providerMessage:safeProviderMessage(j.message,token),requestId:/^[A-Za-z0-9_-]{1,100}$/.test(j.requestId||'')?j.requestId:null});throw e;}return j.data;
 }
 };}
async function main(){
 const {PrismaClient}=require('@prisma/client'),{decryptToken}=require('./cj-catalog-audit.cjs'),fs=require('node:fs');
 const db=new PrismaClient({log:[]});
 try{
  const [auth]=await db.$queryRawUnsafe('SELECT sealed_tokens,access_expires_at FROM cj_auth WHERE id=1 LIMIT 1');
  const token=decryptToken(auth,process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY);
  const result=await sandboxFinancialProbe({api:financialTransport(token),claimOnce:()=>fs.mkdirSync('/app/storage/cj-sandbox-sd-financial-once-34b1f44e'),report:r=>console.log(JSON.stringify(r))});
  console.log(JSON.stringify(result));
 }catch(e){console.log(JSON.stringify({event:'CJ_SANDBOX_FINANCIAL_STOPPED',reference:REFERENCE,reason:e.code==='EEXIST'?'already_started_do_not_repeat':/^sandbox_[a-z_]+$/.test(e.message)?e.message:'local_or_network_failure',endpoint:e.endpoint??null,providerCode:e.providerCode??null,providerMessage:e.providerMessage??null,requestId:e.requestId??null,automaticRetry:false,realPaymentAttempted:false}));process.exitCode=1;}
 finally{await db.$disconnect();}
}
module.exports={sandboxFinancialProbe,financialTransport};
if(require.main===module)main().catch(()=>{console.log('SANDBOX_START_FAILED');process.exitCode=1;});
