'use strict';
const {PrismaClient}=require('@prisma/client');
const {decryptToken}=require('./cj-catalog-audit.cjs');
const {guardedApi,probe}=require('./cj-sandbox-probe.cjs');
const reference='trbhh-sbx-34b1f44e-cce8-4f12-9986-be0fd1576dde';
async function main(){
 const db=new PrismaClient({log:[]});let stage='auth';
 try{
  const [auth]=await db.$queryRawUnsafe('SELECT sealed_tokens,access_expires_at FROM cj_auth WHERE id=1 LIMIT 1');
  const token=decryptToken(auth,process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY);
  stage='lookup_before_create';
  let absent=false;
  try{
   const d=await guardedApi(token)('/shopping/order/getOrderDetail','GET',{orderId:reference});
   if(d?.isSandbox!==1||d.orderNum!==reference||!Array.isArray(d.productList)||d.productList.length!==1||d.productList[0].vid!=='2610070813191630909'||Number(d.productList[0].quantity)!==1)throw Error('sandbox_existing_identity_unverified');
   console.log(JSON.stringify({event:'CJ_SANDBOX_EXISTING_VERIFIED',reference,orderId:d.orderId,isSandbox:1,variantAndQuantityMatched:true,paymentAttempted:false}));return;
  }catch(e){if(e.providerCode!==1603100)throw e;absent=true;}
  if(!absent)throw Error('sandbox_absence_unverified');
  stage='single_sandbox_create_and_readback';
  console.log(JSON.stringify({event:'CJ_SANDBOX_SINGLE_ATTEMPT',reference,isSandbox:1,payType:3,automaticRetry:false}));
  console.log(JSON.stringify(await probe({productId:'281',pid:'2610070813191630000',vid:'2610070813191630909',reference,api:guardedApi(token)})));
 }catch(e){console.log(JSON.stringify({event:'CJ_SANDBOX_STOPPED',reference,stage,reason:/^sandbox_[a-z0-9_]+$/.test(e.message)?e.message:'local_or_network_failure',endpoint:e.endpoint??null,httpStatus:e.httpStatus??null,providerCode:e.providerCode??null,providerMessage:e.providerMessage??null,requestId:e.requestId??null,automaticRetry:false,paymentAttempted:false}));process.exitCode=1;}
 finally{await db.$disconnect();}
}
main().catch(()=>{console.log('SANDBOX_START_FAILED');process.exitCode=1;});
