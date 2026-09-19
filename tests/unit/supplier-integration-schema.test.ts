import {expect,it} from 'vitest';
import {SUPPLIER_DDL,assertSupplierSchemaReady} from '@/lib/suppliers/schema';
import {SUPPLIER_PROVIDERS} from '@/lib/suppliers/types';
import {execFileSync} from 'node:child_process';

function metadata(){
  const tables:{t:string;engine:string}[]=[];
  const columns:{t:string;c:string;data_type:string;column_type:string;nullable:string;def:string|null;length:number|null;collation:string|null;extra:string}[]=[];
  const indexes:{t:string;n:string;c:string;seq:number;non_unique:number;prefix:number|null}[]=[];
  const foreign:{t:string;n:string;c:string;parent:string;ref:string;seq:number;local_parent:number;delete_rule:string;update_rule:string}[]=[];
  const cols=(s:string)=>s.replaceAll('`','').split(',');
  for(const ddl of SUPPLIER_DDL){
    const t=ddl.match(/CREATE TABLE IF NOT EXISTS (\w+)/)![1];
    tables.push({t,engine:'InnoDB'});
    for(const line of ddl.split('\n').slice(1,-1).map(s=>s.trim().replace(/,$/,''))){
      const column=line.match(/^`(\w+)` (.+)$/);
      if(column){
        const [,c,sql]=column,data_type=sql.match(/^\w+/)![0].toLowerCase();
        columns.push({t,c,data_type,column_type:sql.toLowerCase(),nullable:sql.includes('NOT NULL')?'NO':'YES',def:sql.match(/DEFAULT (.+)$/)?.[1].replace(/^'|'$/g,'')??null,length:Number(sql.match(/^(?:VAR)?CHAR\((\d+)\)/)?.[1])||null,collation:['varchar','char','text'].includes(data_type)?'utf8mb4_bin':null,extra:sql.includes('AUTO_INCREMENT')?'auto_increment':''});
      }
      const index=line.match(/^(PRIMARY KEY|UNIQUE KEY (\w+)|KEY (\w+)) \(([^)]+)\)$/);
      if(index)cols(index[4]).forEach((c,i)=>indexes.push({t,n:index[2]||index[3]||'PRIMARY',c,seq:i+1,non_unique:index[3]?1:0,prefix:null}));
      const fk=line.match(/^CONSTRAINT (\w+) FOREIGN KEY \(([^)]+)\) REFERENCES (\w+) \(([^)]+)\)/);
      if(fk)cols(fk[2]).forEach((c,i)=>foreign.push({t,n:fk[1],c,parent:fk[3],ref:cols(fk[4])[i],seq:i+1,local_parent:1,delete_rule:'RESTRICT',update_rule:'RESTRICT'}));
    }
  }
  const db={$queryRaw:async(strings:TemplateStringsArray)=>{
    const sql=strings.join('');
    if(sql.includes('information_schema.TABLES'))return tables;
    if(sql.includes('information_schema.COLUMNS'))return columns;
    if(sql.includes('information_schema.STATISTICS'))return indexes;
    return foreign;
  }};
  return {tables,columns,indexes,foreign,db};
}
it('supports generic providers and eleven additive restrictive binary tables',()=>{
  expect(SUPPLIER_PROVIDERS).toEqual(['salla','cj','other']);
  expect(SUPPLIER_DDL).toHaveLength(11);
  for(const ddl of SUPPLIER_DDL){
    expect(ddl).toMatch(/^CREATE TABLE IF NOT EXISTS supplier_/);
    expect(ddl).toContain('ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');
    expect(ddl).not.toMatch(/CASCADE|DROP TABLE/);
  }
  const sql=SUPPLIER_DDL.join('\n');
  for(const field of ['sync_claim','sync_claimed_at','held_quantity','refresh_claim','encrypted_tokens','commerce_product_id','minimum_margin_minor'])expect(sql).toContain(field);
});
it('fails closed against missing tables without mutating schema',async()=>{
  await expect(assertSupplierSchemaReady({$queryRaw:async()=>[]} as never)).rejects.toThrow('supplier_schema_not_ready');
});
it('Prisma generated SQL mirrors all restrictive supplier relations and unique keys',()=>{
  const sql=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{encoding:'utf8',timeout:20000,env:{...process.env,DATABASE_URL:'mysql://fixture:fixture@127.0.0.1:33309/trbhh_commerce_test'}});
  const m=metadata();
  expect(m.foreign).toHaveLength(17);
  for(const fk of m.foreign){
    const expected='ALTER TABLE `'+fk.t+'` ADD CONSTRAINT `'+fk.n+'` FOREIGN KEY (`'+fk.c+'`) REFERENCES `'+fk.parent+'`(`'+fk.ref+'`) ON DELETE RESTRICT ON UPDATE RESTRICT;';
    expect(sql.split('\n').filter(l=>l.startsWith('ALTER TABLE'))).toContain(expected);
  }
  for(const ddl of SUPPLIER_DDL){
    const table=ddl.match(/CREATE TABLE IF NOT EXISTS (\w+)/)![1];
    const generated=sql.match(new RegExp('CREATE TABLE `'+table+'`[\\s\\S]*?;'))?.[0]||'';
    for(const name of new Set(m.indexes.filter(i=>i.t===table && i.n!=='PRIMARY').map(i=>i.n)))expect(generated).toContain('`'+name+'`');
  }
});
it('accepts complete schema and semantic renamed FK/index names',async()=>{
  const m=metadata();await expect(assertSupplierSchemaReady(m.db as never)).resolves.toBeUndefined();
  for(const f of m.foreign)f.n='renamed_'+f.n;
  for(const i of m.indexes)if(i.n!=='PRIMARY')i.n='renamed_'+i.n;
  await expect(assertSupplierSchemaReady(m.db as never)).resolves.toBeUndefined();
});
it.each(['table','column','engine','unique','prefix','foreign','parent','ref','cascade','binary','default','default_case','nullable','type','job_index'])('rejects incomplete or unsafe %s metadata',async defect=>{
  const m=metadata();
  if(defect==='table')m.tables.pop();
  if(defect==='column')m.columns.pop();
  if(defect==='engine')m.tables[0].engine='MyISAM';
  if(defect==='unique')m.indexes.filter(i=>i.n==='supplier_connection_store').forEach(i=>{i.non_unique=1;});
  if(defect==='prefix')m.indexes.filter(i=>i.n==='supplier_connection_store').forEach(i=>{i.prefix=10;});
  if(defect==='foreign')m.foreign.pop();
  if(defect==='parent')m.foreign[0].parent='users';
  if(defect==='ref')m.foreign[0].ref='missing';
  if(defect==='cascade')m.foreign[0].delete_rule='CASCADE';
  if(defect==='binary')m.columns.find(c=>c.c==='external_store_id')!.collation='utf8mb4_general_ci';
  if(defect==='default')m.columns.find(c=>c.c==='auto_orders_enabled')!.def='1';
  if(defect==='default_case')m.columns.find(c=>c.c==='currency')!.def='sar';
  if(defect==='nullable')m.columns.find(c=>c.c==='encrypted_tokens')!.nullable='NO';
  if(defect==='type')m.columns.find(c=>c.c==='unit_cost_minor')!.data_type='float';
  if(defect==='job_index')m.indexes.splice(m.indexes.findIndex(i=>i.n==='supplier_webhook_jobs'),1);
  await expect(assertSupplierSchemaReady(m.db as never)).rejects.toThrow('supplier_schema_not_ready');
});
