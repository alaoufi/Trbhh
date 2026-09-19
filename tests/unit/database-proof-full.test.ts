import {mkdtempSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, describe, expect, it} from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'database-proof-full-'));
afterAll(() => rmSync(dir, {recursive:true, force:true}));
const script = resolve('scripts/release/database-proof.cjs');
const hash = 'a'.repeat(64);
const table = () => ({count:2,engine:'InnoDB',columns:['payload'],primaryKeyColumns:[],schemaSha256:hash,rowHashes:[hash,hash]});
const manifest = (): {format:string;tables:Record<string,ReturnType<typeof table>>} => ({format:'trbhh-database-full-proof-v1',tables:{users:table(),ads:table(),unlisted:table()}});
let serial = 0;
function compare(a:unknown, b:unknown, mode='verify-restore-full') {
  const prefix=join(dir,String(serial++));
  writeFileSync(prefix+'a.json',JSON.stringify(a)); writeFileSync(prefix+'b.json',JSON.stringify(b));
  return spawnSync(process.execPath,[script,mode,prefix+'a.json',prefix+'b.json'],{encoding:'utf8',timeout:10000});
}
describe('exact isolated full restore CLI', () => {
  it('accepts identical full multisets, including duplicate rows without a PK', () => {
    const result=compare(manifest(),manifest());
    expect(result.status,result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(true);
    expect(result.stdout).not.toContain(hash);
  });
  it.each(['added-table','missing-table','added-row','missing-row','duplicate-replaced','column','schema','engine'])('rejects %s', kind => {
    const a=manifest(), b=manifest();
    if(kind==='added-table') Object.assign(b.tables,{extra:table()});
    if(kind==='missing-table') delete b.tables.unlisted;
    if(kind==='added-row') {b.tables.unlisted.count++;b.tables.unlisted.rowHashes.push(hash);}
    if(kind==='missing-row') {b.tables.unlisted.count--;b.tables.unlisted.rowHashes.pop();}
    if(kind==='duplicate-replaced') b.tables.unlisted.rowHashes[1]='b'.repeat(64);
    if(kind==='column') b.tables.unlisted.columns=['different'];
    if(kind==='schema') b.tables.unlisted.schemaSha256='c'.repeat(64);
    if(kind==='engine') b.tables.unlisted.engine='MyISAM';
    const result=compare(a,b); expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).ok).toBe(false);
  });
  it.each(['legacy','incomplete','invalid-hash','fractional-count'])('fails closed on %s manifests', kind => {
    const a=manifest();
    if(kind==='legacy') a.format='trbhh-database-proof-v1';
    if(kind==='incomplete') a.tables.users.rowHashes.pop();
    if(kind==='invalid-hash') a.tables.users.rowHashes[0]='PRIVATE_SENTINEL';
    if(kind==='fractional-count') a.tables.users.count=1.5;
    const result=compare(a,manifest()); expect(result.status).toBe(1);
    expect(result.stdout+result.stderr).not.toContain('PRIVATE_SENTINEL');
  });
  it('does not accept full manifests in normal preservation verification', () => {
    expect(compare(manifest(),manifest(),'verify').status).toBe(1);
  });
  it('keeps normal preservation verification additive and selected-field based', () => {
    const t={count:1,primaryKeyColumns:['id'],primaryKeys:[hash],protectedColumns:['name'],rowFingerprints:{[hash]:hash}};
    const a={format:'trbhh-database-proof-v1',databaseIdentitySha256:hash,tables:{users:t,ads:t}};
    const b=structuredClone(a); b.tables.ads.count=2;b.tables.ads.primaryKeys.push('b'.repeat(64));b.tables.ads.rowFingerprints['b'.repeat(64)]=hash;
    expect(compare(a,b,'verify').status).toBe(0);
    b.tables.users.rowFingerprints[hash]='c'.repeat(64);
    expect(compare(a,b,'verify').status).toBe(1);
  });
  it('captures every column via stdin without a real DB, preserves duplicates and excludes plaintext', () => {
    const preload=join(dir,'fake-prisma.cjs');
    writeFileSync(preload, `const Module=require('node:module');const original=Module._load;
      Module._load=function(id,...args){if(id!=='@prisma/client')return original.call(this,id,...args);
      return {PrismaClient:class {async $disconnect(){} async $transaction(fn){return fn(this)}
      async $queryRawUnsafe(sql){
        if(sql.includes('information_schema.TABLES'))return ['users','ads','unlisted'].map(name=>({name,engine:'InnoDB'}));
        if(sql.includes('information_schema.COLUMNS'))return ['users','ads','unlisted'].flatMap(t=>['payload','updated_at'].map(c=>({t,c,type:'text',nullable:'YES',def:null})));
        if(sql.includes('KEY_COLUMN_USAGE'))return [];
        if(sql.includes('COUNT(*)'))return [{n:2n}];
        if(sql.startsWith('SELECT DATABASE()'))return [{db:'fixture'}];
        if(sql.startsWith('SELECT HEX(CAST(')&&sql.includes('updated_at'))return [{c0:'505249564154455F53454E54494E454C',c1:null},{c0:'505249564154455F53454E54494E454C',c1:null}];
        throw Error('Unexpected query PRIVATE_SENTINEL');
      }}}};`);
    const result=spawnSync(process.execPath,['--require',preload,'-','snapshot-full'],{input:readFileSync(script,'utf8'),encoding:'utf8',timeout:10000,env:{...process.env,DATABASE_URL:'mysql://fixture:unused@invalid/fixture'}});
    expect(result.status,result.stderr).toBe(0);
    expect(result.stdout+result.stderr).not.toContain('PRIVATE_SENTINEL');
    expect(result.stdout).not.toContain('505249564154455F53454E54494E454C');
    const output=JSON.parse(result.stdout);
    expect(output.format).toBe('trbhh-database-full-proof-v1');
    expect(output.tables.unlisted.columns).toEqual(['payload','updated_at']);
    expect(output.tables.unlisted.rowHashes).toHaveLength(2);
    expect(output.tables.unlisted.rowHashes[0]).toBe(output.tables.unlisted.rowHashes[1]);
    expect(compare(output,output).status).toBe(0);
  });
});
