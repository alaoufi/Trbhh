'use strict';
// Fixed historical review for checkpoint 35619790007. No new release exemptions.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const KEY='sub_remind_lastrun';
const BACKUP_ID='35619790007';
const BASELINE='415a8fe593522859f4cf85c2fa10e47a7d40109b';
const TARGET='1a2111ccd9a17c151a2f47cf793f3bddf4d0451f';
const FORMAT='trbhh-database-proof-v1';
const hash=value=>createHash('sha256').update(value).digest('hex');
function check(ok){if(!ok)throw Error('operational_timestamp_attestation_rejected');}
function norm(value){if(Array.isArray(value))return ['array',value.map(norm)];if(value===null)return ['null'];check(typeof value==='string');return ['string',value];}
const fingerprint=value=>hash(JSON.stringify(norm(value)));
function iso(value){check(typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value));const n=Date.parse(value);check(Number.isFinite(n)&&new Date(n).toISOString()===value);return n;}
function validate(before,after,evidence){
  check(evidence?.key===KEY&&String(evidence.backupId)===BACKUP_ID&&evidence.baselineCommit===BASELINE&&evidence.targetCommit===TARGET);
  check(before?.format===FORMAT&&after?.format===FORMAT&&/^[a-f0-9]{64}$/.test(before.databaseIdentitySha256)&&before.databaseIdentitySha256===after.databaseIdentitySha256);
  check(before.tables?.users&&before.tables?.ads&&after.tables?.users&&after.tables?.ads);
  const observedBefore=Date.parse(before.observedAt),observedAfter=Date.parse(after.observedAt);
  check(observedBefore===Date.parse('2026-09-21T15:35:35Z')&&observedAfter===Date.parse('2026-09-21T15:44:33Z'));
  const oldTime=iso(evidence.beforeValue),newTime=iso(evidence.afterValue);
  check(oldTime<=observedBefore&&newTime>=observedBefore&&newTime<=observedAfter&&newTime-oldTime>=30*60*1000);
  const old=before.tables.site_settings,next=after.tables.site_settings,key=fingerprint([KEY]);
  check(old&&next&&JSON.stringify(old.primaryKeyColumns)==='["k"]'&&JSON.stringify(next.primaryKeyColumns)==='["k"]');
  check(JSON.stringify(old.protectedColumns)==='["k","v"]'&&JSON.stringify(next.protectedColumns)==='["k","v"]');
  check(Number.isSafeInteger(old.count)&&old.count>0&&old.count===next.count&&old.primaryKeys.length===old.count&&next.primaryKeys.length===next.count);
  check(new Set(old.primaryKeys).size===old.count&&JSON.stringify([...old.primaryKeys].sort())===JSON.stringify([...next.primaryKeys].sort()));
  const changed=old.primaryKeys.filter(k=>old.rowFingerprints[k]!==next.rowFingerprints[k]);
  check(changed.length===1&&changed[0]===key);
  check(old.rowFingerprints[key]===fingerprint([['k',KEY],['v',evidence.beforeValue]]));
  check(next.rowFingerprints[key]===fingerprint([['k',KEY],['v',evidence.afterValue]]));
  // Independently reject any other missing record or protected-field delta.
  for(const [name,table] of Object.entries(before.tables)){
    const current=after.tables[name];check(current&&current.count>=table.count&&JSON.stringify(table.primaryKeyColumns)===JSON.stringify(current.primaryKeyColumns)&&JSON.stringify(table.protectedColumns)===JSON.stringify(current.protectedColumns));
    const keys=new Set(current.primaryKeys);check(table.primaryKeys.every(k=>keys.has(k)));
    if(table.protectedColumns.length&&table.primaryKeyColumns.length)for(const k of table.primaryKeys)check(table.rowFingerprints[k]===current.rowFingerprints[k]||(name==='site_settings'&&k===key));
  }
  const reviewed=JSON.parse(JSON.stringify(after));
  reviewed.tables.site_settings.rowFingerprints[key]=old.rowFingerprints[key];
  const attestation={format:'trbhh-reviewed-operational-timestamp-v1',backupId:BACKUP_ID,baselineCommit:BASELINE,targetCommit:TARGET,key:KEY,reason:'Existing admin page subscription-reminder throttle advanced; src/app/admin/layout.tsx:11 and src/lib/subscription.ts:191-201.',beforeValue:evidence.beforeValue,afterValue:evidence.afterValue,observedBefore:before.observedAt,observedAfter:after.observedAt,oldRowSha256:old.rowFingerprints[key],newRowSha256:next.rowFingerprints[key],exactlyOneProtectedRowClassified:true,rawManifestsModified:false,sqlWrites:false,remainingDatabaseVerificationRequired:true};
  return {reviewed,attestation};
}
function read(file){const info=fs.lstatSync(file);check(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&info.size<=64*1024*1024);return fs.readFileSync(file);}
function main(){
  const [beforeFile,afterFile,evidenceFile,...extra]=process.argv.slice(2);check(beforeFile&&afterFile&&evidenceFile&&extra.length===0);
  const base=path.dirname(path.resolve(beforeFile));check(base===path.dirname(path.resolve(afterFile))&&fs.realpathSync(base)===base&&path.basename(base)==='audit-'+BACKUP_ID);
  check(path.basename(beforeFile)==='before.json'&&path.basename(afterFile)==='after.json');
  for(const [name,value] of [['VERIFIED',BASELINE],['commit.txt',BASELINE],['candidate.txt',TARGET]])check(read(path.join(base,name)).toString().trim()===value);
  const beforeRaw=read(beforeFile),afterRaw=read(afterFile),evidenceRaw=read(evidenceFile);
  const {reviewed,attestation}=validate(JSON.parse(beforeRaw),JSON.parse(afterRaw),JSON.parse(evidenceRaw));
  const reviewedRaw=JSON.stringify(reviewed)+'\n';
  Object.assign(attestation,{rawBeforeSha256:hash(beforeRaw),rawAfterSha256:hash(afterRaw),evidenceSha256:hash(evidenceRaw),reviewedAfterSha256:hash(reviewedRaw)});
  const output=path.join(base,'after-reviewed-sub-remind-lastrun.json'),proof=path.join(base,'sub-remind-lastrun-attestation.json');
  check(!fs.existsSync(output)&&!fs.existsSync(proof));
  check(hash(read(beforeFile))===hash(beforeRaw)&&hash(read(afterFile))===hash(afterRaw));
  fs.writeFileSync(output,reviewedRaw,{flag:'wx',mode:0o600});
  fs.writeFileSync(proof,JSON.stringify(attestation)+'\n',{flag:'wx',mode:0o600});
  check(hash(read(beforeFile))===hash(beforeRaw)&&hash(read(afterFile))===hash(afterRaw));
  process.stdout.write(JSON.stringify({ok:true,classifiedOperationalKey:KEY,rawManifestsUnchanged:true,remainingDatabaseVerificationRequired:true})+'\n');
}
if(require.main===module){try{main();}catch{process.stderr.write('Exact operational timestamp attestation rejected; original evidence retained.\n');process.exitCode=1;}}
module.exports={validate,fingerprint,KEY,BACKUP_ID,BASELINE,TARGET};
