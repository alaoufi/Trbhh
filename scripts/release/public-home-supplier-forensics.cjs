'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {isDeepStrictEqual}=require('node:util');
const TABLE='supplier_products';
const FORMAT='trbhh-private-supplier-forensics-v1';
function check(value){if(!value)throw Error('supplier_forensic_evidence_rejected');}
function identifier(value){check(typeof value==='string'&&/^[A-Za-z0-9_]+$/.test(value));return '`'+value+'`';}
async function snapshot(db){return db.$transaction(async tx=>{
  const definitions=await tx.$queryRawUnsafe("SELECT COLUMN_NAME AS c,COLUMN_TYPE AS type,IS_NULLABLE AS nullable,COLUMN_DEFAULT AS def FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='supplier_products' ORDER BY ORDINAL_POSITION");
  check(definitions.length>0&&definitions.some(row=>row.c==='id'));
  const columns=definitions.map(row=>row.c);columns.forEach(identifier);
  const count=await tx.$queryRawUnsafe('SELECT COUNT(*) AS n FROM supplier_products');check(Number(count[0].n)<=10000);
  const selection=columns.map((name,index)=>'HEX(CAST('+identifier(name)+' AS BINARY)) AS c'+index).join(',');
  const records=await tx.$queryRawUnsafe('SELECT CAST(id AS CHAR) AS row_id,'+selection+' FROM supplier_products ORDER BY id');
  check(records.length===Number(count[0].n));
  return {format:FORMAT,definitions,columns,rows:records.map(row=>({id:row.row_id,values:columns.map((_,index)=>row['c'+index])}))};
},{isolationLevel:'RepeatableRead',maxWait:30000,timeout:120000});}
function validate(value){
  check(value?.format===FORMAT&&Array.isArray(value.definitions)&&Array.isArray(value.columns)&&Array.isArray(value.rows));
  check(value.columns.length>0&&value.columns.length===value.definitions.length&&new Set(value.columns).size===value.columns.length&&value.columns.includes('id'));
  value.columns.forEach(identifier);check(isDeepStrictEqual(value.columns,value.definitions.map(row=>row.c)));
  check(value.rows.length<=10000&&new Set(value.rows.map(row=>row.id)).size===value.rows.length);
  for(const row of value.rows){check(typeof row.id==='string'&&/^\d+$/.test(row.id)&&Array.isArray(row.values)&&row.values.length===value.columns.length);check(row.values.every(raw=>raw===null||typeof raw==='string'&&/^(?:[0-9A-F]{2})*$/.test(raw)));check(Buffer.from(row.values[value.columns.indexOf('id')]||'','hex').toString('utf8')===row.id);}
}
function projected(snapshot,projectTable,excluded){
  const columns=snapshot.columns.filter(name=>!excluded.includes(name));
  const records=snapshot.rows.map(row=>Object.fromEntries(columns.map((name,index)=>['c'+index,row.values[snapshot.columns.indexOf(name)]])));
  return projectTable(TABLE,snapshot.definitions,records);
}
function jsonDiff(first,last){
  try{
    const a=JSON.parse(Buffer.from(first||'','hex').toString('utf8')),b=JSON.parse(Buffer.from(last||'','hex').toString('utf8'));
    const result={semanticEqual:isDeepStrictEqual(a,b)};
    if(a&&b&&!Array.isArray(a)&&!Array.isArray(b)&&typeof a==='object'&&typeof b==='object'){
      // Provider keys only, never values or arbitrary product text.
      result.changedTopLevelKeys=[...new Set([...Object.keys(a),...Object.keys(b)])].filter(key=>!isDeepStrictEqual(a[key],b[key])).filter(key=>/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(key));
    }
    return result;
  }catch{return null;}
}
function compare(before,after,baselineProof,currentProof,proofModule){
  validate(before);validate(after);
  check(isDeepStrictEqual(before.columns,after.columns)&&isDeepStrictEqual(before.definitions,after.definitions));
  check(isDeepStrictEqual(projected(before,proofModule.projectTable,proofModule.TABLES[TABLE]),baselineProof.tables[TABLE]));
  check(isDeepStrictEqual(projected(after,proofModule.projectTable,proofModule.TABLES[TABLE]),currentProof.tables[TABLE]));
  check(baselineProof.flags.disabled===true&&currentProof.flags.disabled===true&&baselineProof.flags.sha256===currentProof.flags.sha256);
  const previous=new Map(before.rows.map(row=>[row.id,row])),next=new Map(after.rows.map(row=>[row.id,row]));
  const missingIds=[...previous.keys()].filter(id=>!next.has(id)),addedIds=[...next.keys()].filter(id=>!previous.has(id));
  check(missingIds.length===0&&addedIds.length===0);
  const changes=[];
  for(const [id,row] of previous){
    const current=next.get(id),changedColumns=before.columns.filter((_,index)=>row.values[index]!==current.values[index]);
    if(!changedColumns.length)continue;
    const protectedChangedColumns=changedColumns.filter(name=>!proofModule.TABLES[TABLE].includes(name));
    const jsonFields={};for(const name of protectedChangedColumns){const definition=before.definitions.find(item=>item.c===name);if(String(definition.type).toLowerCase()==='json'){const index=before.columns.indexOf(name);jsonFields[name]=jsonDiff(row.values[index],current.values[index]);}}
    changes.push({productId:id,changedColumns,protectedChangedColumns,jsonFields});
  }
  return {ok:true,baselineMatchesOriginalManifest:true,currentMatchesFailedAfterManifest:true,flagsIdenticalAndDisabled:true,beforeCount:before.rows.length,afterCount:after.rows.length,missingIds,addedIds,changedRows:changes.length,protectedChangedRows:changes.filter(row=>row.protectedChangedColumns.length).length,changes};
}
function read(file){const stat=fs.lstatSync(file);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.size<32*1024*1024);return JSON.parse(fs.readFileSync(file));}
async function main(){let db;try{
  if(process.argv[2]==='snapshot'){
    db=new(require('@prisma/client').PrismaClient)({log:[]});process.stdout.write(JSON.stringify(await snapshot(db))+'\n');
  }else if(process.argv[2]==='compare'){
    const [directory,proofPath,...extra]=process.argv.slice(3);check(extra.length===0&&directory==='/root/trbhh-release-backups/audit-35626587686'&&fs.realpathSync(directory)===directory);
    check(proofPath==='/root/trbhh-release-tools/6b9ad47c6ace6cc7a7c25fc0d04947a5eaece2fb/supplier-preservation-proof.cjs');
    const result=compare(read(path.join(directory,'forensic-supplier-baseline.json')),read(path.join(directory,'forensic-supplier-current.json')),read(path.join(directory,'supplier-before.json')),read(path.join(directory,'supplier-after.json')),require(proofPath));
    process.stdout.write(JSON.stringify(result)+'\n');
  }else check(false);
}catch{process.stderr.write('Bounded supplier forensic proof failed; original evidence retained and values withheld.\n');process.exitCode=1;}finally{if(db)await db.$disconnect();}}
if(require.main===module||module.id==='[stdin]'&&process.argv[1]==='-')void main();
module.exports={snapshot,compare,validate};
