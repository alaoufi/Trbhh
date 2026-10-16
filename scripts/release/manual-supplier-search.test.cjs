const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('search workflow stops on deployment failure, bad marker, or role failure, including conditional callers',()=>{
 const shell=fs.readFileSync('scripts/release/manual-supplier-search.sh','utf8');
 const flow=shell.split('# BEGIN VERIFIED SEARCH FLOW\n')[1];assert.ok(flow);
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'supplier-flow-')),root=tmp.replace(/\\/g,'/'),candidate='a'.repeat(40);
 fs.mkdirSync(path.join(tmp,'arabic-app-123'));const log=path.join(tmp,'arabic-app-123','result.log');
 const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
 try{for(const [deployFail,unitFail,roleFail,marker,pass]of [[1,0,0,1,false],[0,1,0,1,false],[0,0,0,0,false],[0,0,1,1,false],[0,0,0,1,true]]){
  fs.writeFileSync(log,marker?'APPLICATION_CODE_ONLY_VERIFIED — COMMIT='+candidate+' FLAGS_UNCHANGED=1 TIMER_NOT_INSTALLED=1\n':'not verified\n');
  const mock='set -e\nbash(){ case "$1" in *manual-arabic*) echo RUN_ID=123; return "$DEPLOY_FAIL";; *manual-local-role*) [[ "$4" == search && "$5" == --activate ]] || return 99; return "$ROLE_FAIL";; *) return 98;; esac; }\nsystemctl(){ case "$*" in *is-active*) return 1;; *ExecMainStatus*) echo "$UNIT_FAIL";; *Result*) if [[ "$UNIT_FAIL" == 0 ]]; then echo success; else echo exit-code; fi;; esac; }\nrunner(){\n'+flow+'\n}\nif runner; then exit 0; else exit 19; fi';
  const r=spawnSync(bash,['-c',mock],{encoding:'utf8',env:{...process.env,release_root:root,target:root,revision:'b'.repeat(40),candidate,DEPLOY_FAIL:String(deployFail),UNIT_FAIL:String(unitFail),ROLE_FAIL:String(roleFail)}});
  assert.equal(r.status===0,pass,JSON.stringify({deployFail,unitFail,roleFail,marker,stderr:r.stderr,stdout:r.stdout}));
  assert.equal(r.stdout.includes('SUPPLIER_SEARCH_ACTIVATED'),pass);
 }}finally{fs.rmSync(tmp,{recursive:true,force:true});}
 assert.doesNotMatch(shell,/translation --activate|site_settings|install-cj-arabic|docker (?:restart|pull)|systemctl (?:enable|start)/);
 assert.equal(spawnSync(bash,['-n'],{input:shell,encoding:'utf8'}).status,0);
});
