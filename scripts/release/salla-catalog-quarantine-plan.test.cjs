'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {catalogFingerprint,assertSafeCandidate}=require('./salla-catalog-quarantine-plan.cjs');

const products=[
  {id:21n,external_id:'756648303',sku:'15504447-30000023080-',name:'فستان'},
  {id:22n,external_id:'1395878510',sku:'15504448-30000024230-',name:'فستان'},
];

test('catalog fingerprint is stable across database row order',()=>{
  assert.equal(catalogFingerprint(products),catalogFingerprint([...products].reverse()));
});

test('accepts only an inactive unlinked demo catalog with no operational dependencies',()=>{
  const candidate={
    supplierId:1n,connectionId:1n,storeUrl:'https://shabiat24.com',externalStoreId:'1921390206',
    identityId:'1921390206',identityDomain:'https://demostore.salla.sa/dev-uhcitz2gm5qeetym',
    mode:'development',total:20n,active:0n,visible:0n,featured:0n,commerceLinked:0n,
    priceHistory:20n,priceTiers:0n,reservations:0n,supplierOrders:0n,webhookEvents:0n,
  };
  assert.doesNotThrow(()=>assertSafeCandidate(candidate,{supplierId:1n,connectionId:1n,storeUrl:'https://shabiat24.com',wrongStoreId:'1921390206',productCount:20}));
});

test('rejects cleanup when any product, order, reservation, webhook or identity belongs to another flow',()=>{
  const base={
    supplierId:1n,connectionId:1n,storeUrl:'https://shabiat24.com',externalStoreId:'1921390206',
    identityId:'1921390206',identityDomain:'https://demostore.salla.sa/dev-x',mode:'development',
    total:20n,active:0n,visible:0n,featured:0n,commerceLinked:0n,priceHistory:20n,
    priceTiers:0n,reservations:0n,supplierOrders:0n,webhookEvents:0n,
  };
  const expected={supplierId:1n,connectionId:1n,storeUrl:'https://shabiat24.com',wrongStoreId:'1921390206',productCount:20};
  for(const patch of [
    {identityId:'9'},{identityDomain:'https://shabiat24.com'},{mode:'live'},{active:1n},
    {visible:1n},{featured:1n},{commerceLinked:1n},{priceTiers:1n},{reservations:1n},
    {supplierOrders:1n},{webhookEvents:1n},{total:19n},{priceHistory:19n},
  ])assert.throws(()=>assertSafeCandidate({...base,...patch},expected),/catalog_quarantine_unsafe/);
});
