const fs=require('fs');
const {PrismaClient}=require('@prisma/client');
const dir=__dirname;
const {decryptToken}=require(dir+'/cj-catalog-audit.cjs');
const {sandboxFinancialProbe,financialTransport}=require(dir+'/cj-sandbox-financial.cjs');
const ref='trbhh-sbx-34b1f44e-cce8-4f12-9986-be0fd1576dde';
const log=x=>console.log(JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v));
(async()=>{
 const db=new PrismaClient({log:[]});let identified=null,verified=false,prepared=null;
 try{
  const mode=process.argv[2];if(mode!==undefined&&!['--confirm-created','--continue-unpaid'].includes(mode))throw Error('sandbox_mode_invalid');
  const confirmCreated=mode==='--confirm-created',continueUnpaid=mode==='--continue-unpaid';
  const [auth]=await db.$queryRawUnsafe('SELECT sealed_tokens,access_expires_at FROM cj_auth WHERE id=1 LIMIT 1');
  const token=decryptToken(auth,process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY);
  const linked=await db.$queryRawUnsafe('SELECT id FROM commerce_cj_fulfillment_outbox WHERE supplier_reference=? LIMIT 1',ref);
  const legacy=await db.$queryRawUnsafe('SELECT id FROM cj_orders WHERE internal_ref=? LIMIT 1',ref);
  if(linked.length||legacy.length)throw Error('sandbox_linked_to_business_order_stop');
  if(confirmCreated||continueUnpaid){
   const {setupApi,verifyRegistration,verifyReceiver}=require(dir+'/cj-webhook-setup.cjs');
   const settings=await setupApi(token,'/setting/get');
   const wanted={type:'ENABLE',callbackUrls:['https://trbhh.sa/api/integrations/cj/webhooks']};
   if(!verifyRegistration(settings,{order:wanted,logistics:wanted}))throw Error('sandbox_callbacks_not_verified');
   const openId=String(settings.openId??'');if(!/^[1-9]\d{0,63}$/.test(openId))throw Error('sandbox_signing_identity_invalid');
   await verifyReceiver(openId);
   log({event:'CJ_SANDBOX_CALLBACKS_READ_VERIFIED',orderEnabled:true,logisticsEnabled:true,configurationWriteAttempted:false});
  }
  const [start]=await db.$queryRawUnsafe('SELECT COALESCE(MAX(id),0) AS id FROM cj_webhook_events');
  log({event:'TRBHH_WATCH_STARTED',businessOrderLinked:false,webhookKeyFilePresent:fs.existsSync(require('node:path').resolve(process.env.STORAGE_DIR||'/app/storage','cj-webhook-auth.sealed'))});
  try{
   if(continueUnpaid){
    const previous=fs.lstatSync('/app/storage/cj-sandbox-confirm-created-once-34b1f44e');
    if(!previous.isDirectory()||previous.isSymbolicLink())throw Error('sandbox_previous_claim_invalid');
    // Exact identities returned by CJ in the preceding externally observed run.
    prepared={orderId:'261071053280661800',cjOrderCode:'SD261071053270664700'};
   }
   if(confirmCreated){
    const {prepareSandboxPayment,confirmationTransport}=require(dir+'/cj-sandbox-confirm.cjs');
    prepared=await prepareSandboxPayment({api:confirmationTransport(token),claimOnce:()=>{
     const previous=fs.lstatSync('/app/storage/cj-sandbox-sd-financial-once-34b1f44e');
     if(!previous.isDirectory()||previous.isSymbolicLink())throw Error('sandbox_previous_claim_invalid');
     fs.mkdirSync('/app/storage/cj-sandbox-confirm-created-once-34b1f44e');
    },report:log});
   }
   const result=await sandboxFinancialProbe({api:financialTransport(token),claimOnce:()=>fs.mkdirSync(confirmCreated||continueUnpaid?'/app/storage/cj-sandbox-confirmed-financial-once-34b1f44e':'/app/storage/cj-sandbox-sd-financial-once-34b1f44e'),report:r=>{if(r.event==='CJ_SANDBOX_IDENTIFIED'){if((confirmCreated||continueUnpaid)&&(!prepared||r.orderId!==prepared.orderId||r.cjOrderCode!==prepared.cjOrderCode))throw Error('sandbox_confirmation_identity_changed');if(continueUnpaid&&r.status!=='UNPAID')throw Error('sandbox_unpaid_state_required');identified=r;}log(r);}});
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
