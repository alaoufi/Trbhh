'use strict';

const {createHash}=require('node:crypto');

function text(value){return typeof value==='string'?value:String(value??'');}
function integer(value){try{return BigInt(value);}catch{throw Error('catalog_quarantine_unsafe');}}

function catalogFingerprint(products){
  if(!Array.isArray(products)||products.length===0)throw Error('catalog_quarantine_unsafe');
  const rows=products.map(row=>[
    integer(row.id).toString(),text(row.external_id),text(row.sku),text(row.name),
  ].join('\0')).sort();
  return createHash('sha256').update(rows.join('\n'),'utf8').digest('hex');
}

function assertSafeCandidate(candidate,expected){
  const exact=
    integer(candidate.supplierId)===integer(expected.supplierId)&&
    integer(candidate.connectionId)===integer(expected.connectionId)&&
    text(candidate.storeUrl)===expected.storeUrl&&
    text(candidate.externalStoreId)===expected.wrongStoreId&&
    text(candidate.identityId)===expected.wrongStoreId&&
    /^https:\/\/demostore\.salla\.sa\/dev-[a-z0-9_-]+$/i.test(text(candidate.identityDomain))&&
    candidate.mode==='development'&&integer(candidate.total)===BigInt(expected.productCount)&&
    integer(candidate.active)===0n&&integer(candidate.visible)===0n&&integer(candidate.featured)===0n&&
    integer(candidate.commerceLinked)===0n&&integer(candidate.priceHistory)===integer(candidate.total)&&
    integer(candidate.priceTiers)===0n&&integer(candidate.reservations)===0n&&
    integer(candidate.supplierOrders)===0n&&integer(candidate.webhookEvents)===0n;
  if(!exact)throw Error('catalog_quarantine_unsafe');
}

module.exports={catalogFingerprint,assertSafeCandidate};
