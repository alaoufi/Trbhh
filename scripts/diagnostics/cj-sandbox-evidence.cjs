'use strict';
const fs=require('fs');
const {readExpectedIdentity}=require('./cj-sandbox-identity.cjs');
const {inspectSource}=require('./cj-sandbox-evidence-source.cjs');
const {inspectInbound}=require('./cj-sandbox-evidence-inbound.cjs');
const paid=s=>/^(300|400|500|600|PENDING|PROCESSING|UNSHIPPED|SHIPPED|DELIVERED|PAID)$/i.test(String(s));
function verdict(source,inbound){
 const reads=[source?.order?.referenceRead,source?.order?.codeRead];
 const topics=source?.settings?.facts?.topics;
 const result={sourceIdentityVerified:source?.order?.identityVerified===true,sandboxPaidVerified:reads.every(r=>r?.ok===true&&paid(r.evidence.status)),sourceTrackingVerified:reads.every(r=>r?.ok===true&&r.evidence.trackingMatched===true),subscriptionsVerified:['order','logistics'].every(k=>topics?.[k]?.type==='ENABLE'&&topics[k].expectedDestination===true),receiverAuthenticated:source?.receiver?.verified===true,paidWebhookReceived:inbound?.events?.some(e=>paid(e.status))===true,trackingWebhookReceived:inbound?.summary?.trackingReceived===true,rawTrackingPresentButNotIndexed:inbound?.summary?.rawTrackingPresentButNotIndexed===true,isolatedFromCustomerOrders:inbound?.businessLinks?.commerce===0&&inbound?.businessLinks?.legacy===0,customerOrderRoundtripVerified:false,refundVerified:false,realPaymentAttempted:false};
 result.trackingFinding=result.rawTrackingPresentButNotIndexed?'RAW_TRACKING_NOT_INDEXED':result.trackingWebhookReceived?'TRACKING_RECEIVED':'TRACKING_CALLBACK_NOT_OBSERVED';
 result.readyForLivePurchase=false;
 return result;
}
async function main(){
 const {PrismaClient}=require('@prisma/client');
 const db=new PrismaClient({log:[]});
 const report={event:'CJ_COMPLETE_READ_ONLY_REPORT',createdAt:new Date().toISOString(),realPaymentAttempted:false,storeConfigurationChanged:false};
 try{
  const expected=readExpectedIdentity(__dirname+'/expected-identity.json');report.identity=expected;
  try{const [auth]=await db.$queryRawUnsafe('SELECT sealed_tokens,access_expires_at FROM cj_auth WHERE id=1 LIMIT 1');const {decryptToken}=require('./cj-catalog-audit.cjs');const token=decryptToken(auth,process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY);report.source=await inspectSource({token,expected});}catch{report.source={issue:'SOURCE_INSPECTION_UNAVAILABLE'};}
  try{report.inbound=await inspectInbound({db,expected});}catch{report.inbound={issue:'INBOUND_INSPECTION_UNAVAILABLE'};}
  report.gates={};for(const key of ['CJ_ALLOW_LIVE_ORDERS','CJ_FULFILLMENT_WORKER_ENABLED','CJ_LIVE_TRIAL_ENABLED','SUPPLIER_ALLOW_LIVE_ORDERS']){const v=process.env[key];report.gates[key]=v===undefined?'absent':v==='true'?'true':v==='false'?'false':'other';}
  try{const r=await fetch('http://127.0.0.1:3000/api/version',{signal:AbortSignal.timeout(5000)});const d=await r.json();report.application={httpStatus:r.status,commit:typeof d.commit==='string'&&/^[a-f0-9]{40}$/.test(d.commit)?d.commit:null};}catch{report.application={issue:'VERSION_UNAVAILABLE'};}
  report.result=verdict(report.source,report.inbound);
 }catch{report.issue='REPORT_IDENTITY_OR_DATABASE_UNAVAILABLE';process.exitCode=1;}
 finally{await db.$disconnect();}
 fs.writeFileSync(__dirname+'/report.json',JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({event:'CJ_FINAL_EVIDENCE_RESULT',...(report.result||{}),issue:report.issue||null}));
}
module.exports={verdict};
if(require.main===module)main().catch(()=>{console.log('REPORT_START_FAILED');process.exitCode=1;});
