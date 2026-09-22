'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
// Compile exact reviewed source. No web runtime, release script, OAuth or payment module.
const sources=['scripts/release/access-control-bootstrap.ts','src/lib/access-control/store.ts','src/lib/access-control/schema.ts','src/lib/access-control/catalog.ts','src/lib/auth-policy-lock.ts'];
function build(){
  const definitions=sources.map(file=>{
    const result=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
    if(result.diagnostics.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error('build_failed');
    return JSON.stringify(file)+':function(require,module,exports){\n'+result.outputText+'\n}';
  });
  return `'use strict';
const nativeRequire=require,definitions={${definitions.join(',')}},cache=Object.create(null);
function load(id){
 if(id==='server-only')return {};
 if(['node:crypto','node:net','@prisma/client'].includes(id))return nativeRequire(id);
 if(!Object.hasOwn(definitions,id))throw Error('access_module_not_allowed');
 if(cache[id])return cache[id].exports;
 const item={exports:{}};cache[id]=item;
 const local=name=>{if(name.startsWith('.')){const p=nativeRequire('node:path').posix;return load(p.normalize(p.join(p.dirname(id),name))+'.ts');}if(name.startsWith('@/'))return load('src/'+name.slice(2)+'.ts');return load(name);};
 definitions[id](local,item,item.exports);return item.exports;
}
const entry=load('scripts/release/access-control-bootstrap.ts');module.exports=entry;
if(require.main===module)void entry.main().then(code=>{process.exitCode=code;},()=>{console.error('access_bootstrap_failed');process.exitCode=1;});
`;
}
module.exports={build};
if(require.main===module){
  try{const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--output'||path.extname(args[1])!=='.cjs')throw Error('arguments');fs.writeFileSync(path.resolve(args[1]),build(),{flag:'wx',mode:0o600});}
  catch{console.error('Build refused: provide --output pointing to a new .cjs file.');process.exitCode=1;}
}
