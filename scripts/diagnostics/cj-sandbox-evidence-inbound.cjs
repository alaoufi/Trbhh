'use strict';
// Read-only evidence projection. Never calls CJ, processes events, or returns raw payloads.
const MAX_PAYLOAD=60000,MAX_EVENTS=200,MAX_NODES=256,MAX_DEPTH=7;
const privateKey=/token|secret|password|customer|contact|address|phone|email|recipient|authorization|cookie/i;
const safeKey=/^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const knownTypes=new Set(['ORDER','LOGISTIC','LOGISTICS','PRODUCT','STOCK','INVENTORY','DISPUTE','PRIVATEORDER','MAKEUP']);
const knownStatus=/^(?:\d{1,6}|CREATED|IN_CART|UNPAID|PAID|PENDING|PROCESSING|UNSHIPPED|SHIPPED|DELIVERED|COMPLETED|CANCELLED|REFUNDED|REFUNDING|REFUND_PENDING|IN_TRANSIT|INTRANSIT|OUT_FOR_DELIVERY|FAILED_DELIVERY|RETURNED)$/;
const eventType=value=>knownTypes.has(String(value||'').toUpperCase())?String(value).toUpperCase():'OTHER';
const status=value=>knownStatus.test(String(value||'').toUpperCase())?String(value).toUpperCase():null;
function expectedIdentity(expected,track){
 if(!expected||typeof expected!=='object')throw Error('sandbox_expected_identity_required');
 const result={reference:expected.reference??expected.orderNum,orderId:expected.orderId,cjOrderCode:expected.cjOrderCode};
 if(!Object.values(result).every(v=>typeof v==='string'&&/^[-A-Za-z0-9_]{1,100}$/.test(v))||!/^SD\d{6,60}$/.test(result.cjOrderCode)||typeof track!=='string'||!/^TRBHH-SANDBOX-[A-Z0-9-]{1,80}$/.test(track))throw Error('sandbox_expected_identity_invalid');
 return result;
}
function project(row,expected,track,diagnostics){
 const matchedBy=new Set(),identities={},paths=new Set();let trackingMatched=false,indexedTrack=false,rawTrack=false,rawStatus=null,nodes=0,bounded=false;
 const observe=(value,origin,key)=>{
  if(typeof value!=='string'&&typeof value!=='number')return;
  const text=String(value);
  for(const [name,wanted] of Object.entries(expected))if(text===wanted){matchedBy.add(origin+'.'+name);identities[name]=wanted;}
  if(text===track){trackingMatched=true;if(origin==='indexed')indexedTrack=true;else rawTrack=true;matchedBy.add(origin+'.syntheticTrack');}
  if(origin==='payload'&&/(?:^|_)(?:status)$|Status$/i.test(key))rawStatus??=status(value);
 };
 observe(row.order_number,'indexed','order_number');observe(row.cj_order_id,'indexed','cj_order_id');observe(row.track_number,'indexed','track_number');
 let payload=row.payload;
 if(typeof payload==='string'){
  if(payload.length>MAX_PAYLOAD){diagnostics.oversized++;payload=null;}
  else {try{payload=JSON.parse(payload);}catch{diagnostics.malformed++;if(payload.length===MAX_PAYLOAD)diagnostics.possiblyTruncated++;payload=null;}}
 }
 function walk(value,path,depth){
  if(++nodes>MAX_NODES||depth>MAX_DEPTH){bounded=true;return;}
  if(Array.isArray(value)){for(const item of value.slice(0,40))walk(item,path+'[]',depth+1);if(value.length>40)bounded=true;return;}
  if(!value||typeof value!=='object')return;
  const entries=Object.entries(value);if(entries.length>60)bounded=true;
  for(const [key,item] of entries.slice(0,60)){
   if(!safeKey.test(key)||privateKey.test(key)||['__proto__','constructor','prototype'].includes(key))continue;
   const next=path?path+'.'+key:key;if(paths.size<80)paths.add(next);
   observe(item,'payload',key);if(item&&typeof item==='object')walk(item,next,depth+1);
  }
 }
 if(payload&&typeof payload==='object')walk(payload,'',0);
 if(bounded)diagnostics.bounded++;
 if(!matchedBy.size)return null;
 const date=row.received_at instanceof Date?row.received_at:new Date(row.received_at);
 return {id:/^\d{1,24}$/.test(String(row.id))?String(row.id):null,type:eventType(row.type),status:status(row.raw_status)||rawStatus,trackingMatched,rawTrackingPresentButNotIndexed:rawTrack&&!indexedTrack,matchedBy:[...matchedBy].sort(),identities,processed:Number(row.processed)===1?1:0,receivedAt:Number.isFinite(date.getTime())?date.toISOString():null,rawFieldPaths:[...paths].sort()};
}
async function inspectInbound({db,expected,track='TRBHH-SANDBOX-TEST-001'}){
 const identity=expectedIdentity(expected,track);
 const latest=await db.$queryRawUnsafe('SELECT id,type,cj_order_id,order_number,raw_status,track_number,processed,received_at,payload FROM cj_webhook_events WHERE received_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 6 HOUR) ORDER BY id DESC LIMIT 200');
 // Older rows use exact indexed identities only; no unbounded payload scan over history.
 const older=await db.$queryRawUnsafe('SELECT id,type,cj_order_id,order_number,raw_status,track_number,processed,received_at,payload FROM cj_webhook_events WHERE received_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 6 HOUR) AND (order_number IN (?,?,?) OR cj_order_id IN (?,?,?) OR track_number=?) ORDER BY id DESC LIMIT 200',identity.reference,identity.orderId,identity.cjOrderCode,identity.reference,identity.orderId,identity.cjOrderCode,track);
 const [commerce]=await db.$queryRawUnsafe('SELECT COUNT(*) AS count FROM commerce_cj_fulfillment_outbox WHERE supplier_reference=? OR cj_order_id IN (?,?)',identity.reference,identity.orderId,identity.cjOrderCode);
 const [legacy]=await db.$queryRawUnsafe('SELECT COUNT(*) AS count FROM cj_orders WHERE internal_ref=? OR cj_order_id IN (?,?)',identity.reference,identity.orderId,identity.cjOrderCode);
 const diagnostics={malformed:0,possiblyTruncated:0,oversized:0,bounded:0},events=[],unrelated=new Map(),seen=new Set();
 for(const [rows,isLatest] of [[latest,true],[older,false]])for(const row of rows.slice(0,MAX_EVENTS)){
  const key=String(row.id);if(seen.has(key))continue;seen.add(key);
  const event=project(row,identity,track,diagnostics);
  if(event){if(events.length<MAX_EVENTS)events.push(event);}
  else if(isLatest){const type=eventType(row.type);unrelated.set(type,(unrelated.get(type)||0)+1);}
 }
 const count=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;
 return {event:'TRBHH_SANDBOX_INBOUND_EVIDENCE',readOnly:true,windowHours:6,latestScanned:Math.min(latest.length,MAX_EVENTS),olderIndexedScanned:Math.min(older.length,MAX_EVENTS),olderPayloadSearch:false,businessLinks:{commerce:count(commerce?.count),legacy:count(legacy?.count)},summary:{noEvent:events.length===0,matchingEvents:events.length,trackingReceived:events.some(e=>e.trackingMatched),rawTrackingPresentButNotIndexed:events.some(e=>e.rawTrackingPresentButNotIndexed)},payloadDiagnostics:diagnostics,unrelatedLatestTypes:[...unrelated].map(([type,count])=>({type,count})).sort((a,b)=>a.type.localeCompare(b.type)),events};
}
module.exports={inspectInbound};
