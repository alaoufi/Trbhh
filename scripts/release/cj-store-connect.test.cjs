const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildPlan,connectionsMatch}=require('./cj-store-connect.cjs');
function fixture(){return [[{id:'2609231037543532300',name:'Trbhh',status:1,type:'api'}],{id:247n,hidden:0,cj_product_id:'2610090314401607200',details_json:JSON.stringify({variants:[{vid:'VID1'}]})},{pid:'2610090314401607200',productNameEn:'Source name',productImage:'["https://cf.cjdropshipping.com/product.jpg"]'},[{vid:'VID1',variantSku:'SKU1',variantNameEn:'Source option',variantImage:'https://cf.cjdropshipping.com/variant.jpg'}],[{areaId:1,countryCode:'CN'}],[{logisticName:'Observed route',logisticPrice:8.5}]];}
test('plan uses owned explicit shop and exact source variants without invented prices or inventory',()=>{
 const plan=buildPlan(...fixture());assert.equal(plan.connection.shopId,'2609231037543532300');assert.equal(plan.connection.variantList[0].cjVariantId,'VID1');assert.equal(plan.batch.variants[0].id,plan.connection.variantList[0].platformVariantId);assert(!Object.hasOwn(plan.product,'priceMin'));assert(!Object.hasOwn(plan.batch.variants[0],'shopPrice'));assert(!Object.hasOwn(plan.batch.variants[0],'oldInventoryQuantity'));
});
test('wrong shop, product, changed variants or hidden local product stop the plan',()=>{
 for(const change of [a=>a[0][0].id='other',a=>a[0][0].status=2,a=>a[1].hidden=1,a=>a[2].pid='other',a=>a[3][0].vid='other']){const args=fixture();change(args);assert.throws(()=>buildPlan(...args));}
});
test('missing warehouse, unknown quote or untrusted image stops rather than choosing defaults',()=>{
 for(const change of [a=>a[4]=[],a=>a[5]=[],a=>a[5][0].logisticPrice='',a=>a[5][0].logisticPrice=-1,a=>a[3][0].variantImage='https://untrusted.example/image.jpg']){const args=fixture();change(args);assert.throws(()=>buildPlan(...args));}
});
test('complete variant identifiers with conflicting logistics or countries are not verified',()=>{
 const target=buildPlan(...fixture()).connection;
 const line={shopId:target.shopId,platformProductId:target.platformProductId,cjProductId:target.cjProductId,...target.variantList[0],defaultArea:target.defaultArea,logistics:target.logistics,sourceCountryCode:target.sourceCountryCode,targetCountryCode:target.targetCountryCode};
 assert.equal(connectionsMatch([line],target),true);
 for(const [key,value] of [['defaultArea',2],['logistics','Other route'],['sourceCountryCode','US'],['targetCountryCode','US']])assert.equal(connectionsMatch([{...line,[key]:value}],target),false);
 const missing={...line};delete missing.logistics;assert.equal(connectionsMatch([missing],target),false);
 assert.equal(connectionsMatch([],target),false);
});
