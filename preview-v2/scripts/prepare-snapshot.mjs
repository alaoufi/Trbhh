import {readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {validateSnapshot} from '../lib/snapshot.ts';
const dir=new URL('../lib/generated/',import.meta.url);
const target=new URL('snapshot.json',dir);
// Clear stale live data before validating so a failed input cannot reuse an older snapshot.
rmSync(target,{force:true});
const input=process.env.TRBHH_SNAPSHOT_FILE;
const snapshot=input?validateSnapshot(JSON.parse(readFileSync(input,'utf8'))):{mode:'demo',listings:[]};
mkdirSync(dir,{recursive:true});writeFileSync(target,JSON.stringify(snapshot));
console.log(`Prepared ${snapshot.mode} snapshot (${snapshot.listings.length} records)`);
