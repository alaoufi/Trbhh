const fs = require('node:fs');
const assert = require('node:assert/strict');
const [beforePath, afterPath] = process.argv.slice(2);
const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'))[0];
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'))[0];
const env = (c) => Object.fromEntries(c.Config.Env.map((v) => { const at = v.indexOf('='); return [v.slice(0, at), v.slice(at + 1)]; }));
const first = env(before); const last = env(after);
if(['merchant_oauth','merchant_headers','supplier_selection','public_home','national_day','national_day_immersive','national_day_loyalty','supplier_admin','banner_separation','onboarding_link','onboarding_template','onboarding_legacy_email','onboarding_legacy_identity'].includes(process.argv[4])){
  const keys=['SALLA_CLIENT_ID','SALLA_CLIENT_SECRET','SALLA_WEBHOOK_SECRET','SUPPLIER_TOKEN_ENCRYPTION_KEY','SUPPLIER_RECONCILE_SECRET','SUPPLIER_PUBLIC_ORIGIN','SUPPLIER_ALLOW_LIVE_ORDERS'];
  if(keys.some(key=>!first[key]||first[key]!==last[key])||first.SUPPLIER_PUBLIC_ORIGIN!=='https://trbhh.sa'||first.SUPPLIER_ALLOW_LIVE_ORDERS!=='false'){
    console.error('Merchant OAuth runtime preservation or disabled-order gate failed; values withheld.');process.exit(1);
  }
}
if(process.argv[4]==='salla'){
  const allowed=new Set(['SALLA_CLIENT_ID','SALLA_CLIENT_SECRET','SALLA_WEBHOOK_SECRET','SUPPLIER_TOKEN_ENCRYPTION_KEY','SUPPLIER_RECONCILE_SECRET','SUPPLIER_PUBLIC_ORIGIN','SUPPLIER_ALLOW_LIVE_ORDERS']);
  for(const key of new Set([...Object.keys(first),...Object.keys(last)])){
    if(!allowed.has(key)&&first[key]!==last[key]){console.error('Unrelated runtime environment changed; values withheld.');process.exit(1);}
  }
  if(last.SUPPLIER_PUBLIC_ORIGIN!=='https://trbhh.sa'||last.SUPPLIER_ALLOW_LIVE_ORDERS!=='false'||[...allowed].some(key=>!last[key])){console.error('Salla runtime configuration gate failed; values withheld.');process.exit(1);}
  for(const key of ['SUPPLIER_TOKEN_ENCRYPTION_KEY','SUPPLIER_RECONCILE_SECRET'])if(first[key]&&first[key]!==last[key]){console.error('Persistent Salla key changed; values withheld.');process.exit(1);}
}
for (const key of ['DATABASE_URL', 'AUTH_SECRET', 'STORAGE_DIR', 'LEGACY_LOCAL_DIR']) {
  if (first[key] !== last[key]) { console.error(`Runtime preservation check failed for ${key}; values withheld.`); process.exit(1); }
}
const mounts = (c) => c.Mounts.map(({ Type, Name, Source, Destination, RW }) => ({ Type, Name, Source, Destination, RW })).sort((a, b) => a.Destination.localeCompare(b.Destination));
try { assert.deepEqual(mounts(before), mounts(after)); }
catch { console.error('Production mounts changed; details withheld.'); process.exit(1); }
console.info('Production database connection, signing secret and storage mounts unchanged.');
