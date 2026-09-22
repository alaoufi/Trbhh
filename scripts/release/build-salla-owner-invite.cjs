'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
// Deliberately exclude connections.ts: this operation can issue an invitation but
// cannot exchange tokens, refresh grants, synchronize products or create orders.
const sources = [
  'scripts/release/salla-owner-invite.ts',
  'src/lib/suppliers/merchant-oauth.ts',
  'src/lib/suppliers/salla-scope-contract.ts',
  'src/lib/suppliers/config.ts',
  'src/lib/suppliers/crypto.ts',
  'src/lib/suppliers/http.ts',
  'src/lib/commerce/config.ts',
  'src/lib/commerce/money.ts',
];
function build() {
  const definitions = sources.map(file => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const result = ts.transpileModule(source, {fileName: file, compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}, reportDiagnostics: true});
    if (result.diagnostics.some(item => item.category === ts.DiagnosticCategory.Error)) throw Error('owner_invitation_build_failed');
    return `${JSON.stringify(file)}:function(require,module,exports){\n${result.outputText}\n}`;
  });
  return `'use strict';\nconst __nativeRequire=require;\nconst __modules={${definitions.join(',\n')}};\nconst __cache=Object.create(null);\nfunction __load(id){\n if(id==='server-only')return {};\n if(id==='node:crypto'||id==='@prisma/client')return __nativeRequire(id);\n if(!Object.prototype.hasOwnProperty.call(__modules,id))throw Error('owner_invitation_module_not_allowed');\n if(__cache[id])return __cache[id].exports;\n const item={exports:{}};__cache[id]=item;\n const localRequire=(name)=>{if(name.startsWith('.')){const path=__nativeRequire('node:path').posix;return __load(path.normalize(path.join(path.dirname(id),name))+'.ts');}if(name.startsWith('@/'))return __load('src/'+name.slice(2)+'.ts');return __load(name);};\n __modules[id](localRequire,item,item.exports);return item.exports;\n}\nconst __entry=__load('scripts/release/salla-owner-invite.ts');\nmodule.exports=__entry;\nif(require.main===module||(module.id==='[stdin]'&&process.argv[1]==='-')){\n if(process.argv.length!==2){process.stderr.write('Salla owner invitation refused: unexpected arguments.\\n');process.exitCode=1;}\n else void __entry.main().then(code=>{process.exitCode=code;},()=>{process.stderr.write('Salla owner invitation failed.\\n');process.exitCode=1;});\n}\n`;
}
module.exports = {build};
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--output' || !args[1] || path.extname(args[1]) !== '.cjs') throw Error('arguments');
    const output = build();
    fs.writeFileSync(path.resolve(args[1]), output, {flag: 'wx', mode: 0o600});
  } catch {
    process.stderr.write('Salla owner invitation build failed; output must be a new .cjs file.\n');
    process.exitCode = 1;
  }
}
