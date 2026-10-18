'use strict';
/** Read-only post-deploy probe. Never prints receipt paths, cookies, document bytes, or financial/customer details. */
async function verifyPrivateReceipts({db,fetchImpl=fetch}){
 const rows=await db.wallet_topups.findMany({where:{AND:[{receipt:{not:null}},{receipt:{not:''}}]},select:{user_id:true,receipt:true}});
 if(!rows.length)throw Error('RECEIPT_EVIDENCE_EMPTY');
 let originDenied=0,publicDenied=0;
 for(const row of rows){
  const match=/^uploads\/topup_([1-9]\d{0,19})_\d+\.[a-z0-9]{1,10}$/i.exec(row.receipt||'');
  if(!match||BigInt(match[1])!==BigInt(row.user_id))throw Error('RECEIPT_OWNER_BINDING_UNVERIFIED');
  for(const origin of ['http://127.0.0.1:3000','https://trbhh.sa']){
   const response=await fetchImpl(origin+'/media/'+row.receipt,{redirect:'manual',headers:{range:'bytes=0-0'},cache:'no-store',signal:AbortSignal.timeout(15000)});
   let denied;
   try{denied=response.status===404&&/\bno-store\b/i.test(response.headers.get('cache-control')||'');}finally{await response.body?.cancel();}
   if(!denied)throw Error(origin.startsWith('https:')?'RECEIPT_PUBLIC_CACHE_REVIEW_REQUIRED':'RECEIPT_ORIGIN_NOT_PRIVATE');
   if(origin.startsWith('https:'))publicDenied++;else originDenied++;
  }
 }
 return {receipts:rows.length,originDenied,publicDenied};
}
module.exports={verifyPrivateReceipts};
if(require.main===module){
 const {PrismaClient}=require('@prisma/client'),db=new PrismaClient({log:[]});
 (async()=>{try{console.log(JSON.stringify({event:'PRIVATE_RECEIPTS_ANONYMOUS_ACCESS_VERIFIED',...await verifyPrivateReceipts({db}),financialWrites:0}));}catch(error){const allowed=['RECEIPT_EVIDENCE_EMPTY','RECEIPT_OWNER_BINDING_UNVERIFIED','RECEIPT_PUBLIC_CACHE_REVIEW_REQUIRED','RECEIPT_ORIGIN_NOT_PRIVATE'];console.error(allowed.includes(error.message)?error.message:'RECEIPT_ACCESS_PROBE_FAILED');process.exitCode=1;}finally{await db.$disconnect();}})();
}
