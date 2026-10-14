const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseBatchIds,main}=require('./cj-store-batch.cjs');
test('bounded explicit product IDs reject duplicates, shell input and implicit full-catalog execution',()=>{
 assert.deepEqual(parseBatchIds('1,247'),['1','247']);
 for(const value of ['', '0', '01', '1,1', '1;echo', '1,$(echo)', 'all', Array.from({length:49},(_,i)=>i+1).join(',')])assert.throws(()=>parseBatchIds(value));
});
async function runScenario(mode){
 const original={...process.env};const originalExit=process.exitCode;
 const multiple=mode.endsWith('_then_new');
 Object.assign(process.env,{CJ_STORE_BATCH_IDS:multiple?'12,13':'12',CJ_API_KEY:'fake-key',CJ_API_BASE:'https://developers.cjdropshipping.com/api2.0/v1',SUPPLIER_ALLOW_LIVE_ORDERS:'false',DATABASE_URL:'mysql://test:test@127.0.0.1/test'});
 const calls=[],connected=new Set(mode==='existing'?['trbhh-cj-12']:[]);let limitedOnce=false;
 const line={shopId:'2609231037543532300',cjProductId:'PID',cjVariantId:'VID',platformProductId:'trbhh-cj-12',platformVariantId:'trbhh-cj-12-VID'};
 try{
  const report=await main({pace:0,cooldown:0,emit:()=>{},execute:(_bin,_args,_options,callback)=>callback(null,(multiple?['12','13']:['12']).map(id=>JSON.stringify({id,cj_product_id:'PID',hidden:0,details_json:JSON.stringify({variants:[{vid:'VID'}]})})).join('\n')+'\n'),fetchApi:async(url,options)=>{
   const parsed=new URL(url),route=parsed.pathname.replace('/api2.0/v1',''),productId=parsed.searchParams.get('platformProductId')||parsed.searchParams.get('platformProductIds');const body=options.body?JSON.parse(options.body):null;calls.push({route,method:options.method,body});
   let data;
   if(parsed.hostname==='cj-product-center.oss-accelerate.aliyuncs.com'){assert.equal(options.method,'HEAD');assert(!options.headers['CJ-Access-Token']);return{ok:true,status:200,redirected:false,headers:{get:key=>key==='content-type'?'image/jpeg':key==='content-length'?'1024':null}};}
   if(!limitedOnce&&((mode==='read_rate'&&route==='/product/query')||(mode==='metadata_rate'&&route==='/store/product/saveProduct'))){limitedOnce=true;return{ok:false,status:429,json:async()=>({code:1600200,result:false})};}
   if(route==='/authentication/getAccessToken')data={accessToken:'fake-token'};
   else if(route==='/shop/getShops')data=[{id:line.shopId,name:'Trbhh',status:1,type:'api'}];
   else if(route==='/product/query')data={pid:'PID',productNameEn:'Source',productImage:mode==='reviewed_cdn'?'https://cj-product-center.oss-accelerate.aliyuncs.com/p.jpg':'https://cf.cjdropshipping.com/p.jpg'};
   else if(route==='/product/variant/query')data=[{vid:'VID',variantSku:'SKU',variantImage:'https://cf.cjdropshipping.com/v.jpg'}];
   else if(route==='/product/stock/getInventoryByPid')data={inventories:[{areaId:1,countryCode:'CN'}]};
   else if(route==='/logistic/freightCalculate')data=[{logisticName:'Actual route',logisticPrice:3}];
   else if(route==='/product/conn/connection'&&options.method==='GET')data={list:connected.has(productId)?[{...line,platformProductId:productId,platformVariantId:productId+'-VID'}]:[]};
   else if(route==='/shop/product/queryDetail')data=(mode==='partial'||mode==='partial_then_new')&&productId==='trbhh-cj-12'?[{id:line.platformProductId}]:[];
   else if(route==='/store/product/saveProduct'){if(mode==='uncertain_then_new'&&body.id==='trbhh-cj-12')throw Error('network_timeout');data=true;}
   else if(route==='/store/product/saveVariantBatch')data=body.variants.map(v=>({id:v.id,productId:v.productId,saveSuccess:true}));
   else if(route==='/product/conn/connection'&&options.method==='POST'){connected.add(body.platformProductId);data=true;}
   else throw Error('unexpected_endpoint');
   return {ok:true,json:async()=>({code:200,result:true,success:true,data})};
  }});
  return {report,calls};
 }finally{for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);process.exitCode=originalExit;}
}
test('existing exact identities cause zero metadata writes even when routing fields are absent',async()=>{
 const {report,calls}=await runScenario('existing');assert.equal(report.ok,true);assert.equal(report.results[0].created,false);assert.equal(report.results[0].routingVerified,false);assert.equal(report.writes.length,0);assert(!calls.some(c=>c.route.startsWith('/store/')));
});
test('new CJ product-center bucket is checked as a raster without API credentials before metadata writes',async()=>{
 const {report,calls}=await runScenario('reviewed_cdn');assert.equal(report.ok,true);const head=calls.findIndex(c=>c.method==='HEAD'),save=calls.findIndex(c=>c.route==='/store/product/saveProduct');assert(head>=0&&save>head);
});
test('only a rate-limited read is retried before metadata creation',async()=>{
 const {report,calls}=await runScenario('read_rate');assert.equal(report.ok,true);assert.equal(calls.filter(c=>c.route==='/product/query').length,2);assert.equal(calls.filter(c=>c.route==='/store/product/saveProduct').length,1);
});
test('a rate-limited metadata POST is never automatically retried',async()=>{
 const {report,calls}=await runScenario('metadata_rate');assert.equal(report.ok,false);assert.equal(report.results[0].metadataAttempted,true);assert.equal(calls.filter(c=>c.route==='/store/product/saveProduct').length,1);assert.equal(calls.filter(c=>c.route==='/store/product/saveVariantBatch').length,0);
});
test('an untouched conflicting product does not block an independent later product',async()=>{
 const {report,calls}=await runScenario('partial_then_new');assert.equal(report.ok,false);assert.equal(report.processed,2);assert.equal(report.results[0].metadataAttempted,false);assert.equal(report.results[1].identityVerified,true);assert.equal(report.writes.length,3);
 assert.deepEqual(calls.filter(c=>c.route==='/store/product/saveProduct').map(c=>c.body.id),['trbhh-cj-13']);
});
test('an uncertain metadata write stops later products and is never retried blindly',async()=>{
 const {report,calls}=await runScenario('uncertain_then_new');assert.equal(report.ok,false);assert.equal(report.processed,1);assert.equal(report.results[0].metadataAttempted,true);assert.equal(report.writes.length,0);
 assert.deepEqual(calls.filter(c=>c.route==='/store/product/saveProduct').map(c=>c.body.id),['trbhh-cj-12']);
});
test('partial existing metadata stops before any save or connection retry',async()=>{
 const {report}=await runScenario('partial');assert.equal(report.ok,false);assert.equal(report.results[0].error,'existing_product_requires_reconciliation');assert.equal(report.writes.length,0);
});
test('new metadata is confirmed by exact identity readback without invented price or inventory',async()=>{
 const {report,calls}=await runScenario('new');assert.equal(report.ok,true);assert.equal(report.results[0].identityVerified,true);assert.equal(report.writes.length,3);assert.equal(report.purchasePerformed,false);
 for(const call of calls.filter(c=>c.route.startsWith('/store/'))){const text=JSON.stringify(call.body);assert(!/shopPrice|InventoryQuantity|priceMin/.test(text));}
 assert(!calls.some(c=>/shopping|payBalance|createOrder/.test(c.route)));
});

