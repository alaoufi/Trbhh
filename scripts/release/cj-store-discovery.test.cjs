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

test('readiness reports only credential presence and explicitly validated modes',()=>{
 const {readinessReport}=require('./cj-store-discovery.cjs');
 const report=readinessReport([{k:'commerce_default_margin_bps',v:'3000'},{k:'commerce_gateway_enabled',v:'1'},{k:'pay_mode',v:'live'},{k:'pay_provider',v:'alrajhi_arb'}],{ALRAJHI_ENVIRONMENT:'production',ALRAJHI_TRANPORTAL_PASSWORD:'sensitive-value',CJ_LIVE_TRIAL_ENABLED:'true'});
 assert.equal(report.marginBps,3000);assert.equal(report.bank.fields.length,10);assert.equal(report.bank.configured,false);assert.equal(report.settings.commerce_gateway_enabled,true);assert.equal(report.settings.commerce_payments_enabled,false);assert.equal(report.environment.CJ_LIVE_TRIAL_ENABLED,true);assert(!JSON.stringify(report).includes('sensitive-value'));
});
