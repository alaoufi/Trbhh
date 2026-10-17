const fs=require('fs');
const {PrismaClient}=require('@prisma/client');
const dir=__dirname;
const {decryptToken}=require(dir+'/cj-catalog-audit.cjs');
const {sandboxFinancialProbe,financialTransport}=require(dir+'/cj-sandbox-financial.cjs');
const ref='trbhh-sbx-34b1f44e-cce8-4f12-9986-be0fd1576dde';
const log=x=>console.log(JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v));
(async()=>{
 const db=new PrismaClient({log:[]});let identified=null,verified=false;
 try{
  const [auth]=await db.$queryRawUnsafe('SELECT sealed_tokens,access_expires_at FROM cj_auth WHERE id=1 LIMIT 1');
  const token=decryptToken(auth,process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY);
  const linked=await db.$queryRawUnsafe('SELECT id FROM commerce_cj_fulfillment_outbox WHERE supplier_reference=? LIMIT 1',ref);
  const legacy=await db.$queryRawUnsafe('SELECT id FROM cj_orders WHERE internal_ref=? LIMIT 1',ref);
  if(linked.length||legacy.length)throw Error('sandbox_linked_to_business_order_stop');
  const [start]=await db.$queryRawUnsafe('SELECT COALESCE(MAX(id),0) AS id FROM cj_webhook_events');
  log({event:'TRBHH_WATCH_STARTED',businessOrderLinked:false,webhookKeyFilePresent:fs.existsSync(require('node:path').resolve(process.env.STORAGE_DIR||'/app/storage','cj-webhook-auth.sealed'))});
  try{
   const result=await sandboxFinancialProbe({api:financialTransport(token),claimOnce:()=>fs.mkdirSync('/app/storage/cj-sandbox-sd-financial-once-34b1f44e'),report:r=>{if(r.event==='CJ_SANDBOX_IDENTIFIED')identified=r;log(r);}});
   log(result);verified=true;
  }catch(e){log({event:'CJ_SIMULATION_STOPPED',reason:e.code==='EEXIST'?'already_attempted_no_retry':/^sandbox_[a-z_]+$/.test(e.message)?e.message:'local_or_network_failure',endpoint:e.endpoint??null,code:e.providerCode??null,message:e.providerMessage??null,requestId:e.requestId??null,automaticRetry:false});}
  const orderId=identified?.orderId||ref,code=identified?.cjOrderCode||ref;
  let rows=[];
  for(let i=0;i<7;i++){
   rows=await db.$queryRawUnsafe('SELECT id,type,raw_status,track_number,processed,received_at FROM cj_webhook_events WHERE id>? AND (order_number=? OR cj_order_id IN (?,?,?)) ORDER BY id DESC LIMIT 20',BigInt(start.id),ref,ref,orderId,code);
   if(rows.some(r=>r.track_number==='TRBHH-SANDBOX-TEST-001')&&rows.some(r=>/^(300|400|500|600|PENDING|PROCESSING|UNSHIPPED|SHIPPED|DELIVERED|PAID)$/i.test(r.raw_status)))break;
   if(i<6)await new Promise(r=>setTimeout(r,5000));
  }
  log({event:'TRBHH_INBOUND_RESULT',cjSimulationVerified:verified,newMatchingEvents:rows.length,paidStatusReceived:rows.some(r=>/^(300|400|500|600|PENDING|PROCESSING|UNSHIPPED|SHIPPED|DELIVERED|PAID)$/i.test(r.raw_status)),trackingReceived:rows.some(r=>r.track_number==='TRBHH-SANDBOX-TEST-001'),businessOrderLinked:false,customerOrderUpdated:false,realPaymentAttempted:false,events:rows.map(r=>({id:String(r.id),type:r.type,status:r.raw_status,trackingMatched:r.track_number==='TRBHH-SANDBOX-TEST-001',processed:r.processed,receivedAt:r.received_at}))});
 }catch(e){log({event:'TEST_STOPPED',reason:/^[a-z_]+$/.test(e.message)?e.message:e.name,realPaymentAttempted:false});process.exitCode=1;}
 finally{await db.$disconnect();}
})().catch(()=>{console.log('TEST_START_FAILED');process.exitCode=1;});
