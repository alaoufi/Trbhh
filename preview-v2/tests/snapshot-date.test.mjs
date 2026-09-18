import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const url=new URL('../lib/snapshot-date.ts',import.meta.url);
const api=existsSync(url)?await import(url.href):{};
test('snapshot date uses Saudi time and Gregorian Arabic calendar across midnight',()=>{
 assert.equal(typeof api.snapshotDateLabel,'function');
 const iso='2026-09-19T22:30:00.000Z';
 const expected=new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Riyadh'}).format(new Date(iso));
 assert.equal(api.snapshotDateLabel(iso),expected);
 assert.match(api.snapshotDateLabel(iso),/٢٠/);
 assert.doesNotMatch(api.snapshotDateLabel(iso),/T22:30|Z$/);
});
