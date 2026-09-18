'use strict';
// Standalone: never import application helpers (some perform schema/lifecycle writes).
const {createHash}=require('node:crypto');
const ORIGIN='https://trbhh.sa';
function mediaUrl(raw){
  if(typeof raw!=='string'||!raw||raw.startsWith('//')||raw.includes('\\')||(/^[a-z][a-z0-9+.-]*:/i.test(raw)&&!raw.startsWith('https://')))return null;
  try {
    const decoded=decodeURIComponent(raw);
    if(decoded.split('/').includes('..'))return null;
    const url=new URL(raw.startsWith('http')||raw.startsWith('/')?raw:'/media/'+raw,ORIGIN);
    if(url.protocol!=='https:'||!['trbhh.sa','trbhh.com','www.trbhh.sa','www.trbhh.com'].includes(url.hostname)||url.username||url.password||url.port||url.search||url.hash||!url.pathname.startsWith('/media/'))return null;
    return url.href;
  }catch{return null;}
}
function publicAd(row,images){
  const revision=createHash('sha256').update(JSON.stringify([String(row.id),row.updated_at,row.title,row.detail,row.price,row.price_type,row.rent_period,String(row.category_id),row.subcategory_id,images])).digest('hex');
  return {id:String(row.id),title:row.title,description:row.detail,price:Number(row.price),priceType:row.price_type??null,rentPeriod:row.rent_period??null,city:row.city||'',seller:row.seller||'معلن',verified:Number(row.trusted)===1,condition:'',specs:[],category:'',subcategory:'',classificationRevision:revision,sourceUrl:ORIGIN+'/ads/'+String(row.id),time:row.created_at?new Date(row.created_at).toISOString().slice(0,10):'',images,image:images[0]||'/placeholder-ad.svg',intent:row.adsType==='طلب'?'wanted':'offer',sourceCategoryId:String(row.category_id),sourceSubcategoryId:row.subcategory_id==null?null:String(row.subcategory_id)};
}
function censorPattern(words){
  const parts=words.map(word=>String(word).trim()).filter(Boolean).map(word=>[...word].map(ch=>ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^\\p{L}\\p{N}]*'));
  return parts.length?new RegExp('(?<![\\p{L}\\p{N}])(?:'+parts.join('|')+')(?![\\p{L}\\p{N}])','giu'):null;
}
async function exportSnapshot(){
  const {PrismaClient}=require('@prisma/client');
  const url=new URL(process.env.DATABASE_URL);
  url.searchParams.set('connection_limit','1');
  const client=new PrismaClient({datasources:{db:{url:url.href}},log:[]});
  try {
    // Own single-connection pool: the transaction below uses this read-only session.
    await client.$executeRawUnsafe('SET SESSION TRANSACTION READ ONLY');
    return await client.$transaction(async tx=>{
      const guard=await tx.$queryRawUnsafe('SELECT @@session.transaction_read_only AS ro');
      if(Number(guard[0]?.ro)!==1)throw new Error('Read-only guard unavailable');
      const stamp=await tx.$queryRawUnsafe('SELECT UTC_TIMESTAMP(3) AS captured_at');
      const capturedAt=new Date(stamp[0].captured_at).toISOString();
      const settings=await tx.$queryRawUnsafe("SELECT v FROM site_settings WHERE k = 'platform_ad_lifecycle_enabled'");
      const value=settings[0]?.v??'0';
      const lifecycle=value!=='0'&&value!==''&&String(value).toLowerCase()!=='false';
      const packages=await tx.$queryRawUnsafe('SELECT id, price, ad_days, is_default FROM packages WHERE active = 1 ORDER BY sort ASC, price ASC, id ASC');
      const defaultDays=Number((packages.find(p=>Number(p.is_default)===1)||packages.find(p=>Number(p.price)===0))?.ad_days||0);
      // Aggregate-only reconciliation with public search. Never log row contents.
      const reconciliation=await tx.$queryRawUnsafe(`SELECT COUNT(*) AS public_candidates,
        SUM(u.id IS NULL) AS missing_owner,
        SUM(a.paused_by_owner<>0) AS paused,
        SUM(a.publish_at>clock.now) AS future,
        SUM(a.data_archive IS NOT NULL AND TRIM(a.data_archive)<>'') AS archived,
        SUM(a.data_delete IS NOT NULL AND TRIM(a.data_delete)<>'') AS deleted
        FROM ads a CROSS JOIN (SELECT ? AS now) clock LEFT JOIN users u ON u.id=a.user_id
        LEFT JOIN user_packages up ON up.user_id=a.user_id AND (up.expires_at IS NULL OR up.expires_at>clock.now)
        LEFT JOIN packages p ON p.id=up.package_id AND p.active=1
        WHERE a.status=1 AND a.state='1' AND COALESCE(u.ban,'')<>'checked'
        AND ((?=1 AND a.trbhh_until>clock.now) OR (?=0 AND (a.store_only=0 OR a.trbhh_until>clock.now)))
        AND ((a.adsSpecial='checked' AND a.expires_at>clock.now) OR a.urgent_until>clock.now
          OR COALESCE(p.ad_days,?)=0 OR a.created_at IS NULL OR DATE_ADD(a.created_at, INTERVAL COALESCE(p.ad_days,?) DAY)>=clock.now)`,
        new Date(capturedAt),lifecycle?1:0,lifecycle?1:0,defaultDays,defaultDays);
      console.error('Public visibility reconciliation:',JSON.stringify(Object.fromEntries(Object.entries(reconciliation[0]).map(([key,value])=>[key,Number(value||0)]))));
      const banned=await tx.$queryRawUnsafe('SELECT word FROM banned_words');
      const pattern=censorPattern(banned.map(row=>row.word));
      const redact=value=>pattern?value.replace(pattern,match=>'█'.repeat(Math.max(3,[...match].length))):value;
      const result=[];let cursor=0n;
      for(;;){
        const rows=await tx.$queryRawUnsafe(`SELECT a.id,a.title,a.detail,a.price,a.price_type,a.rent_period,a.adsType,a.category_id,a.subcategory_id,a.created_at,a.updated_at,
          COALESCE(c.name,'') AS city,COALESCE(NULLIF(u.name,''),NULLIF(u.userName,''),'معلن') AS seller,u.trusted
          FROM ads a CROSS JOIN (SELECT ? AS now) clock JOIN users u ON u.id=a.user_id LEFT JOIN cities c ON c.id=a.city_id
          LEFT JOIN user_packages up ON up.user_id=a.user_id AND (up.expires_at IS NULL OR up.expires_at>clock.now)
          LEFT JOIN packages p ON p.id=up.package_id AND p.active=1
          WHERE a.id>? AND a.status=1 AND a.state='1' AND COALESCE(u.ban,'')<>'checked'
          AND a.paused_by_owner=0 AND (a.publish_at IS NULL OR a.publish_at<=clock.now)
          AND (a.data_archive IS NULL OR TRIM(a.data_archive)='') AND (a.data_delete IS NULL OR TRIM(a.data_delete)='')
          AND ((?=1 AND a.trbhh_until>clock.now) OR (?=0 AND (a.store_only=0 OR a.trbhh_until>clock.now)))
          AND ((a.adsSpecial='checked' AND a.expires_at>clock.now) OR a.urgent_until>clock.now
            OR COALESCE(p.ad_days,?)=0 OR a.created_at IS NULL OR DATE_ADD(a.created_at, INTERVAL COALESCE(p.ad_days,?) DAY)>=clock.now)
          ORDER BY a.id ASC LIMIT 250`,new Date(capturedAt),cursor,lifecycle?1:0,lifecycle?1:0,defaultDays,defaultDays);
        if(!rows.length)break;
        if(result.length+rows.length>10000)throw new Error('Snapshot exceeds reviewed limit');
        const ids=rows.map(row=>row.id);
        const photos=await tx.$queryRawUnsafe(`SELECT ph.other_id,up.file_name FROM photos ph JOIN uploads up ON up.id=CAST(ph.photo_path AS UNSIGNED)
          WHERE ph.other_id IN (${ids.map(()=>'?').join(',')}) AND up.deleted_at IS NULL ORDER BY ph.id ASC`,...ids);
        const byId=new Map();
        for(const photo of photos){
          if(!photo.file_name)continue;
          const src=mediaUrl(photo.file_name);
          // Unknown hosts/paths require explicit review, never silently lose real images.
          if(!src)throw new Error('Unreviewed public media path');
          const key=String(photo.other_id);const images=byId.get(key)||[];images.push(src);byId.set(key,images);
        }
        for(const row of rows)result.push(publicAd({...row,title:redact(row.title),detail:redact(row.detail)},byId.get(String(row.id))||[]));
        cursor=rows.at(-1).id;
      }
      const sourceCommit=process.env.SNAPSHOT_SOURCE_COMMIT||'';
      if(!/^[a-f0-9]{40}$/.test(sourceCommit))throw new Error('Missing deployed source revision');
      return {schemaVersion:1,mode:'live',source:ORIGIN,capturedAt,sourceCommit,count:result.length,complete:true,listings:result.reverse()};
    },{maxWait:10000,timeout:120000,isolationLevel:'RepeatableRead'});
  }finally{await client.$disconnect();}
}
module.exports={mediaUrl,publicAd,censorPattern};
if(require.main===module||module.id==='[stdin]'){
  exportSnapshot().then(data=>process.stdout.write(JSON.stringify(data))).catch(()=>{console.error('Public snapshot failed; no payload released. Inspect schema/media compatibility without logging private rows or credentials.');process.exitCode=1;});
}
