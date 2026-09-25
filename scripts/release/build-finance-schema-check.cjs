'use strict';
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function build(){
 const revisionSource=fs.readFileSync(path.join(root,'src/lib/finance/tax-index-upgrade.ts'),'utf8');
 const revisionCompiled=ts.transpileModule(revisionSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const revision=`(function(){const exports={};const require=id=>{if(id==='server-only')return {};throw Error('unexpected_schema_dependency');};${revisionCompiled}\nreturn exports;})()`;
 const modules=['access-control','finance'].map(name=>{
  const source=fs.readFileSync(path.join(root,'src/lib',name,'schema.ts'),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  // The dependency is fixed at build time, never resolved from server files or input.
  const approved=name==='finance'?`if(id==='./tax-index-upgrade')return ${revision};`:'';
  return `(function(){const exports={};const require=id=>{if(id==='server-only')return {};${approved}throw Error('unexpected_schema_dependency');};${compiled}\nreturn exports;})()`;
 });
 return `'use strict';\nconst access=${modules[0]},finance=${modules[1]};\nconst {PrismaClient}=require('@prisma/client');\nconst db=new PrismaClient({log:[]});\n(async()=>{try{await access.assertAccessControlSchema(db);await finance.assertFinanceSchemaReady(db);const state=await db.$queryRawUnsafe('SELECT initialized_at FROM access_control_state WHERE id=1');if(!state[0]?.initialized_at)throw Error('not_initialized');const orderColumns=await db.$queryRawUnsafe("SELECT COLUMN_NAME AS c,COLUMN_TYPE AS type,IS_NULLABLE AS nullable,COLUMN_DEFAULT AS def FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='commerce_order_items'");const orderSchema=new Map(orderColumns.map(r=>[r.c,r]));const requirements={list_unit_price_minor:['int','YES',null],discount_minor:['int','NO','0'],variant_key:['varchar(191)','NO',''],variant_snapshot:['json','YES',null]};for(const [name,[type,nullable,def]] of Object.entries(requirements)){const column=orderSchema.get(name);const actualDefault=column?.def==null?null:String(column.def).replace(/^'(.*)'$/,'$1');if(!column||String(column.type).toLowerCase().replace(/\\bint\\(\\d+\\)/g,'int')!==type||column.nullable!==nullable||actualDefault!==def)throw Error('order_item_snapshot_schema_invalid');}const rows=await db.$queryRawUnsafe("SELECT v FROM site_settings WHERE k IN ('commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled')");if(rows.some(r=>!['0','false',null].includes(r.v))||process.env.SUPPLIER_ALLOW_LIVE_ORDERS!=='false')throw Error('unsafe_gate');console.log('Finance, RBAC and order-item snapshot schemas verified; purchase, payment and supplier live-order gates disabled.');}catch{console.error('finance_release_schema_or_gate_failed');process.exitCode=1;}finally{await db.$disconnect();}})();\n`;
}
module.exports={build};
if(require.main===module){const [file,...extra]=process.argv.slice(2);if(!file||extra.length)throw Error('output_required');fs.writeFileSync(file,build(),{flag:'wx',mode:0o600});}
