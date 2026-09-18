import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
test('stdin execution actually invokes the exporter and fails closed without database access',()=>{
  const script=readFileSync(new URL('../scripts/export-public-snapshot.cjs',import.meta.url),'utf8');
  const result=spawnSync(process.execPath,[],{input:script,encoding:'utf8',env:{...process.env,DATABASE_URL:''}});
  assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/Public snapshot failed/);
});
let api={};
try { api=require('../scripts/export-public-snapshot.cjs'); } catch(error) { if(error.code!=='MODULE_NOT_FOUND')throw error; }
test('visibility uses one bound millisecond timestamp and direct expiry, not rounded elapsed seconds',()=>{
  const source=readFileSync(new URL('../scripts/export-public-snapshot.cjs',import.meta.url),'utf8');
  assert.match(source,/UTC_TIMESTAMP\(3\)/);
  assert.match(source,/CROSS JOIN \(SELECT \? AS now\)/);
  assert.match(source,/DATE_ADD\(a\.created_at, INTERVAL COALESCE\(p\.ad_days,\?\) DAY\)>=clock\.now/);
  assert.doesNotMatch(source,/TIMESTAMPDIFF|UTC_TIMESTAMP\(\)/);
});
test('public media URLs reject foreign hosts, credentials, traversal and non-media paths',()=>{
  assert.equal(typeof api.mediaUrl,'function');
  assert.equal(api.mediaUrl('uploads/a.jpg'),'https://trbhh.sa/media/uploads/a.jpg');
  assert.equal(api.mediaUrl('/media/a.webp'),'https://trbhh.sa/media/a.webp');
  for(const value of ['https://evil.example/a.jpg','//evil.example/a.jpg','javascript:alert(1)','/admin/export','../secret','https://x:y@trbhh.sa/media/a.jpg','/media/%2e%2e/admin'])assert.equal(api.mediaUrl(value),null,value);
});
test('snapshot projection preserves original public content and never copies private columns',()=>{
  assert.equal(typeof api.publicAd,'function');
  const row={id:7n,title:'عنوان أصلي',detail:'وصف أصلي',price:150,city:'الرياض',seller:'متجر',created_at:new Date('2026-09-19T00:00:00Z'),updated_at:new Date('2026-09-19T00:00:00Z'),adsType:'offer',category_id:8n,subcategory_id:9,trusted:1,phone:'SECRET',email:'SECRET',balance:77,password:'SECRET'};
  const ad=api.publicAd(row,['https://trbhh.sa/media/a.jpg']);
  assert.equal(ad.id,'7');assert.equal(ad.title,row.title);assert.equal(ad.description,row.detail);assert.equal(ad.price,150);assert.equal(ad.condition,'');assert.deepEqual(ad.specs,[]);
  assert.equal(ad.sourceUrl,'https://trbhh.sa/ads/7');assert.deepEqual(ad.images,['https://trbhh.sa/media/a.jpg']);
  assert.equal(JSON.stringify(ad).includes('SECRET'),false);assert.equal('balance' in ad,false);assert.equal(ad.classificationRevision.length,64);
  assert.notEqual(api.publicAd({...row,title:'changed'},ad.images).classificationRevision,ad.classificationRevision);
});
