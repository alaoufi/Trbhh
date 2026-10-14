'use strict';
const fs=require('node:fs');
const {releaseGates}=require('./supplier-preservation-proof.cjs');
function patch(source){
 const branch='branch=claude/hostinger-vps-project-amw8vb';
 const guard="if(rows.some(r=>!['0','false',null].includes(r.v))||process.env.SUPPLIER_ALLOW_LIVE_ORDERS!=='false')throw Error('unsafe_gate');";
 const query='SELECT v FROM site_settings';
 const count=(s,part)=>s.split(part).length-1;
 if(count(source,branch)!==1||count(source,guard)!==2||count(source,query)!==2)throw Error('manual_release_source_changed');
 return source.replace(branch,'branch=codex/cj-card-settlements-20261014').replaceAll(query,'SELECT k,v FROM site_settings').replaceAll(guard,`(${releaseGates.toString()})(rows,process.env,true);`);
}
module.exports={patch};
if(require.main===module){const file=process.argv[2];if(process.argv.length!==3||!file?.endsWith('/finance-deploy.sh')||fs.lstatSync(file).isSymbolicLink())throw Error('manual_release_path');fs.writeFileSync(file,patch(fs.readFileSync(file,'utf8')),{mode:0o600});}
