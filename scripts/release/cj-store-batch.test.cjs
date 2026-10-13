const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseBatchIds,main}=require('./cj-store-batch.cjs');
test('bounded explicit product IDs reject duplicates, shell input and implicit full-catalog execution',()=>{
 assert.deepEqual(parseBatchIds('1,247'),['1','247']);
 for(const value of ['', '0', '01', '1,1', '1;echo', '1,$(echo)', 'all', Array.from({length:25},(_,i)=>i+1).join(',')])assert.throws(()=>parseBatchIds(value));
});
async function runScenario(mode){
 const original={...process.env};const originalExit=process.exitCode;
 Object.assign(process.env,{CJ_STORE_BATCH_IDS:'12',CJ_API_KEY:'fake-key',CJ_API_BASE:'https://developers.cjdropshipping.com/api2.0/v1',SUPPLIER_ALLOW_LIVE_ORDERS:'false',DATABASE_URL:'mysql://test:test@127.0.0.1/test'});
 const calls=[];let connected=mode==='existing';
 const line={shopId:'2609231037543532300',cjProductId:'PID',cjVariantId:'VID',platformProductId:'trbhh-cj-12',platformVariantId:'trbhh-cj-12-VID'};
 try{
  const report=await main({pace:0,emit:()=>{},execute:(_bin,_args,_options,callback)=>callback(null,JSON.stringify({id:'12',cj_product_id:'PID',hidden:0,details_json:JSON.stringify({variants:[{vid:'VID'}]})})+'\n'),fetchApi:async(url,options)=>{
   const route=new URL(url).pathname.replace('/api2.0/v1','');const body=options.body?JSON.parse(options.body):null;calls.push({route,method:options.method,body});
   let data;
   if(route==='/authentication/getAccessToken')data={accessToken:'fake-token'};
   else if(route==='/shop/getShops')data=[{id:line.shopId,name:'Trbhh',status:1,type:'api'}];
   else if(route==='/product/query')data={pid:'PID',productNameEn:'Source',productImage:'https://cf.cjdropshipping.com/p.jpg'};
   else if(route==='/product/variant/query')data=[{vid:'VID',variantSku:'SKU',variantImage:'https://cf.cjdropshipping.com/v.jpg'}];
   else if(route==='/product/stock/getInventoryByPid')data={inventories:[{areaId:1,countryCode:'CN'}]};
   else if(route==='/logistic/freightCalculate')data=[{logisticName:'Actual route',logisticPrice:3}];
   else if(route==='/product/conn/connection'&&options.method==='GET')data={list:connected?[line]:[]};
   else if(route==='/shop/product/queryDetail')data=mode==='partial'?[{id:line.platformProductId}]:[];
   else if(route==='/store/product/saveProduct')data=true;
   else if(route==='/store/product/saveVariantBatch')data=body.variants.map(v=>({id:v.id,productId:v.productId,saveSuccess:true}));
   else if(route==='/product/conn/connection'&&options.method==='POST'){connected=true;data=true;}
   else throw Error('unexpected_endpoint');
   return {ok:true,json:async()=>({code:200,result:true,success:true,data})};
  }});
  return {report,calls};
 }finally{for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);process.exitCode=originalExit;}
}
test('existing exact identities cause zero metadata writes even when routing fields are absent',async()=>{
 const {report,calls}=await runScenario('existing');assert.equal(report.ok,true);assert.equal(report.results[0].created,false);assert.equal(report.results[0].routingVerified,false);assert.equal(report.writes.length,0);assert(!calls.some(c=>c.route.startsWith('/store/')));
});
test('partial existing metadata stops before any save or connection retry',async()=>{
 const {report}=await runScenario('partial');assert.equal(report.ok,false);assert.equal(report.results[0].error,'existing_product_requires_reconciliation');assert.equal(report.writes.length,0);
});
test('new metadata is confirmed by exact identity readback without invented price or inventory',async()=>{
 const {report,calls}=await runScenario('new');assert.equal(report.ok,true);assert.equal(report.results[0].identityVerified,true);assert.equal(report.writes.length,3);assert.equal(report.purchasePerformed,false);
 for(const call of calls.filter(c=>c.route.startsWith('/store/'))){const text=JSON.stringify(call.body);assert(!/shopPrice|InventoryQuantity|priceMin/.test(text));}
 assert(!calls.some(c=>/shopping|payBalance|createOrder/.test(c.route)));
});
