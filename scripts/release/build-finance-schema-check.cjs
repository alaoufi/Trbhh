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
 return `'use strict';\nconst access=${modules[0]},finance=${modules[1]};\nconst {PrismaClient}=require('@prisma/client');\nconst db=new PrismaClient({log:[]});\n(async()=>{try{await access.assertAccessControlSchema(db);await finance.assertFinanceSchemaReady(db);const state=await db.$queryRawUnsafe('SELECT initialized_at FROM access_control_state WHERE id=1');if(!state[0]?.initialized_at)throw Error('not_initialized');const rows=await db.$queryRawUnsafe("SELECT v FROM site_settings WHERE k IN ('commerce_purchasing_enabled','commerce_payments_enabled','commerce_enabled')");if(rows.some(r=>!['0','false',null].includes(r.v))||process.env.SUPPLIER_ALLOW_LIVE_ORDERS!=='false')throw Error('unsafe_gate');console.log('Finance and RBAC schema verified; purchase, payment and supplier live-order gates disabled.');}catch{console.error('finance_release_schema_or_gate_failed');process.exitCode=1;}finally{await db.$disconnect();}})();\n`;
}
module.exports={build};
if(require.main===module){const [file,...extra]=process.argv.slice(2);if(!file||extra.length)throw Error('output_required');fs.writeFileSync(file,build(),{flag:'wx',mode:0o600});}
