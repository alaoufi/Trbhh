'use strict';
/** Private integrity manifests, not public artifacts. No SQL writes or app imports.
 * snapshot > private.json; verify private-before.json private-after.json
 * This proof complements the full DB restore proof. It tolerates only routine
 * timestamps/leases and identical source-sync revision bumps, never data changes.
 */
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const FORMAT='trbhh-supplier-preservation-v1';
const TABLES={
  supplier_integration_profiles:['last_sync_at','last_error'],
  supplier_connections:['updated_at','sync_claim','sync_claimed_at','refresh_claim','refresh_claimed_at'],
  supplier_products:['last_sync_at','revision'],
};
const FLAGS=['commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(){throw Error('supplier_preservation_failed');}
function identifier(value){if(typeof value!=='string'||! /^[A-Za-z0-9_]+$/.test(value))fail();return '`'+value+'`';}
function normalizedSchema(rows){return rows.map(row=>[row.c,String(row.type),String(row.nullable),row.def===null?null:String(row.def)]);}
function projectTable(name,definitions,records){
  if(!Object.hasOwn(TABLES,name)||!definitions.length)fail();
  const columns=definitions.map(row=>row.c).filter(column=>!TABLES[name].includes(column));
  if(!columns.length||new Set(columns).size!==columns.length)fail();
  const rowHashes=records.map(record=>hash(columns.map((column,index)=>{
    const value=record['c'+index];
    if(value!==null&&(typeof value!=='string'||! /^(?:[0-9A-F]{2})*$/.test(value)))fail();
    return value;
  }))).sort();
  return {count:rowHashes.length,columns,schemaHash:hash(normalizedSchema(definitions)),rowHashes};
}
function disabledFlags(rows){
  const values=new Map();
  for(const row of rows){if(!FLAGS.includes(row.k)||values.has(row.k))fail();values.set(row.k,row.v);}
  const result=FLAGS.map(key=>[key,values.has(key),values.get(key)??null]);
  // Missing flags are fail-closed in the app; any unexpected stored value must
  // be reviewed instead of silently interpreting an unsafe setting as disabled.
  if(result.some(([,present,value])=>present&&!['0','false',null].includes(value)))fail();
  return {disabled:true,sha256:hash(result)};
}
async function snapshot(db){
  return db.$transaction(async tx=>{
    const names=Object.keys(TABLES);
    const definitions=await tx.$queryRawUnsafe("SELECT TABLE_NAME AS t,COLUMN_NAME AS c,COLUMN_TYPE AS type,IS_NULLABLE AS nullable,COLUMN_DEFAULT AS def FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('supplier_integration_profiles','supplier_connections','supplier_products') ORDER BY TABLE_NAME,ORDINAL_POSITION");
    const tables={};
    for(const name of names){
      const schema=definitions.filter(row=>row.t===name);
      if(!schema.length)fail();
      const columns=schema.map(row=>row.c).filter(column=>!TABLES[name].includes(column));
      const selection=columns.map((column,index)=>`HEX(CAST(${identifier(column)} AS BINARY)) AS ${identifier('c'+index)}`).join(',');
      const records=await tx.$queryRawUnsafe(`SELECT ${selection} FROM ${identifier(name)}`);
      tables[name]=projectTable(name,schema,records);
    }
    const flags=await tx.$queryRawUnsafe("SELECT k,v FROM site_settings WHERE k IN ('commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled')");
    return {format:FORMAT,tables,flags:disabledFlags(flags)};
  },{isolationLevel:'RepeatableRead',maxWait:30000,timeout:300000});
}
function validate(proof){
  const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  if(!proof||proof.format!==FORMAT||!proof.tables||Object.keys(proof.tables).length!==Object.keys(TABLES).length||proof.flags?.disabled!==true||!digest(proof.flags.sha256))fail();
  for(const name of Object.keys(TABLES)){
    const table=proof.tables[name];
    if(!table||!Number.isSafeInteger(table.count)||table.count<0||!Array.isArray(table.columns)||!table.columns.length||new Set(table.columns).size!==table.columns.length||!digest(table.schemaHash)||!Array.isArray(table.rowHashes)||table.rowHashes.length!==table.count||!table.rowHashes.every(digest))fail();
    table.columns.forEach(identifier);table.rowHashes.sort();
  }
  return proof;
}
function verify(before,after){
  validate(before);validate(after);
  if(before.flags.sha256!==after.flags.sha256)fail();
  for(const name of Object.keys(TABLES)){
    const first=before.tables[name],last=after.tables[name];
    if(['count','columns','schemaHash','rowHashes'].some(key=>JSON.stringify(first[key])!==JSON.stringify(last[key])))fail();
  }
  return {ok:true,comparedTables:Object.keys(TABLES).length,purchasingDisabled:true,paymentsDisabled:true,publicCatalogDisabled:true};
}
async function main(){
  let db;
  try{
    if(process.argv[2]==='snapshot'){
      db=new (require('@prisma/client').PrismaClient)({log:[]});
      process.stdout.write(JSON.stringify(await snapshot(db))+'\n');
    }else if(process.argv[2]==='verify'){
      const before=JSON.parse(readFileSync(process.argv[3],'utf8')),after=JSON.parse(readFileSync(process.argv[4],'utf8'));
      process.stdout.write(JSON.stringify(verify(before,after))+'\n');
    }else fail();
  }catch{process.stderr.write('Supplier preservation or disabled-purchasing verification failed; private values withheld.\n');process.exitCode=1;}
  finally{if(db)await db.$disconnect().catch(()=>{});}
}
module.exports={TABLES,FLAGS,projectTable,disabledFlags,snapshot,verify};
if(require.main===module||module.id==='[stdin]'&&process.argv[1]==='-')void main();
