const {test}=require('node:test'),assert=require('node:assert/strict');
const {successfulRead}=require('./cj-store-discovery.cjs');
test('observed successful code-zero shop array is limited to shop discovery',()=>{
 const result={code:0,success:true,data:[{id:'123',name:'Trbhh'}]};
 assert.equal(successfulRead('/shop/getShops',result),true);
 assert.equal(successfulRead('/authentication/getAccessToken',result),false);
 assert.equal(successfulRead('/shopping/pay/payBalanceV2',result),false);
});
test('failed or malformed shop responses do not become a successful discovery',()=>{
 for(const result of [{code:0,success:false,data:[]},{code:0,success:true,result:false,data:[]},{code:0,success:true,data:{}},{code:0,data:[]}])assert.equal(successfulRead('/shop/getShops',result),false);
 assert.equal(successfulRead('/authentication/getAccessToken',{code:200,success:true}),true);
});
