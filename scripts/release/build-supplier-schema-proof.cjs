// Emit a runtime readiness check from the exact source, never duplicate its schema contract.
const fs=require('node:fs');
const ts=require('typescript');
const source=fs.readFileSync('src/lib/suppliers/schema.ts','utf8').replace(/^import 'server-only';\r?\n/,'');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
process.stdout.write(compiled+`\nconst {PrismaClient}=require('@prisma/client');const db=new PrismaClient({log:[]});(async()=>{if(process.argv[2]==='apply'){for(const sql of exports.SUPPLIER_DDL)await db.$executeRawUnsafe(sql);}await exports.assertSupplierSchemaReady(db);console.info('Supplier schema readiness passed.');})().catch(()=>{console.error('Supplier schema readiness failed; details withheld.');process.exitCode=1;}).finally(()=>db.$disconnect());\n`);
