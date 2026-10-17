'use strict';
const REFERENCE='trbhh-sbx-34b1f44e-cce8-4f12-9986-be0fd1576dde',VID='2610070813191630909';
const DETAIL='/shopping/order/getOrderDetail',CART='/shopping/order/addCart',CONFIRM='/shopping/order/addCartConfirm';
const {safeProviderMessage}=require('./cj-sandbox-probe.cjs');
function identity(d,first){
 if(d?.isSandbox!==1||d.orderNum!==REFERENCE||typeof d.orderId!=='string'||!d.orderId||!/^SD\d{6,60}$/.test(d.cjOrderCode||'')||!Array.isArray(d.productList)||d.productList.length!==1||d.productList[0].vid!==VID||Number(d.productList[0].quantity)!==1||first&&(d.orderId!==first.orderId||d.cjOrderCode!==first.cjOrderCode))throw Error('sandbox_identity_invalid');
 return d;
}
function cartProof(d,code){if(d?.successCount!==1||!Array.isArray(d.addSuccessOrders)||d.addSuccessOrders.length!==1||d.addSuccessOrders[0]!==code||!Array.isArray(d.interceptOrders)||d.interceptOrders.length)throw Error('sandbox_cart_unverified');}
function confirmProof(d){if(d?.submitSuccess!==true||d.successCount!==1||!Array.isArray(d.interceptOrders)||d.interceptOrders.length)throw Error('sandbox_confirmation_unverified');}
async function prepareSandboxPayment({api,claimOnce,report=()=>{}}){
 const first=identity(await api(DETAIL,'GET',{orderId:REFERENCE}));
 let d=identity(await api(DETAIL,'GET',{orderId:first.cjOrderCode}),first);
 if(first.orderStatus!=='CREATED'||d.orderStatus!=='CREATED')throw Error('sandbox_created_state_required');
 await claimOnce();
 cartProof(await api(CART,'POST',{cjOrderIdList:[first.cjOrderCode]}),first.cjOrderCode);
 d=identity(await api(DETAIL,'GET',{orderId:REFERENCE}),first);
 // Query Order documents IN_CART as merged by the API; exact cart membership
 // plus unchanged CREATED is also a valid preconfirmation readback.
 if(!['CREATED','IN_CART'].includes(d.orderStatus))throw Error('sandbox_cart_state_unverified');
 confirmProof(await api(CONFIRM,'POST',{cjOrderIdList:[first.cjOrderCode]}));
 d=identity(await api(DETAIL,'GET',{orderId:REFERENCE}),first);
 if(d.orderStatus!=='UNPAID')throw Error('sandbox_unpaid_state_unverified');
 const result={event:'CJ_SANDBOX_UNPAID_VERIFIED',reference:REFERENCE,orderId:d.orderId,cjOrderCode:d.cjOrderCode,status:d.orderStatus,realPaymentAttempted:false,realFulfillmentRequested:false};report(result);return result;
}
/** Separate from financial transport: cannot pay, generate a parent, alter status,
 * or operate on an unpaired/live order. Unknown mutation outcomes cannot replay. */
function confirmationTransport(token,fetcher=fetch){
 let first=null,phase='initial',last=0,calls=0;const sent=new Set();
 return async(path,method,body)=>{
  if(!((path===DETAIL&&method==='GET')||([CART,CONFIRM].includes(path)&&method==='POST'))||++calls>8)throw Error('sandbox_endpoint_blocked');
  const read=method==='GET';
  if(read){
   const expected=phase==='reference'?first?.cjOrderCode:REFERENCE;
   if(!body||Object.keys(body).length!==1||body.orderId!==expected||!['initial','reference','cart','confirmed'].includes(phase))throw Error('sandbox_lookup_blocked');
  }else{
   if(!first||sent.has(path)||phase!==(path===CART?'paired':'in_cart')||!body||Object.keys(body).length!==1||!Array.isArray(body.cjOrderIdList)||body.cjOrderIdList.length!==1||body.cjOrderIdList[0]!==first.cjOrderCode)throw Error('sandbox_mutation_blocked');
   sent.add(path);phase='uncertain';
  }
  for(let attempt=0;attempt<3;attempt++){
   const wait=3000-(Date.now()-last);if(wait>0)await new Promise(r=>setTimeout(r,wait));last=Date.now();
   const url=new URL('https://developers.cjdropshipping.com/api2.0/v1'+path);if(read)url.searchParams.set('orderId',body.orderId);
   const response=await fetcher(url,{method,headers:{'CJ-Access-Token':token,'Content-Type':'application/json'},...(!read?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
   const j=await response.json();
   if(read&&(response.status===429||j.code===1600200)&&attempt<2){await new Promise(r=>setTimeout(r,4000*2**attempt));continue;}
   if(!response.ok||j.code!==200||j.result===false||j.success===false||(read?j.result!==true:!(j.result===true||j.success===true))){const error=Error('sandbox_confirmation_api_rejected');Object.assign(error,{endpoint:path,httpStatus:response.status,providerCode:j.code,providerMessage:safeProviderMessage(j.message,token),requestId:/^[A-Za-z0-9_-]{1,100}$/.test(j.requestId||'')?j.requestId:null});throw error;}
   const d=j.data;
   if(read){
    identity(d,first);
    const expected={initial:'CREATED',reference:'CREATED',cart:'IN_CART',confirmed:'UNPAID'}[phase];
    if(phase==='cart'?!['CREATED','IN_CART'].includes(d.orderStatus):d.orderStatus!==expected)throw Error('sandbox_confirmation_state_unverified');
    if(phase==='initial'){first=structuredClone(d);phase='reference';}
    else phase={reference:'paired',cart:'in_cart',confirmed:'done'}[phase];
   }else if(path===CART){cartProof(d,first.cjOrderCode);phase='cart';}
   else {confirmProof(d);phase='confirmed';}
   return d;
  }
 };
}
module.exports={prepareSandboxPayment,confirmationTransport};
