'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const compose=spawnSync('docker',['compose','version','--short'],{encoding:'utf8',timeout:15000});
const available=compose.status===0;

// Config rendering is daemon-free: no image is pulled and no service is started.
// Local Windows may have no Docker CLI; hosted CI must execute this regression.
test('real Compose preserves dollar-rich runtime secrets through the rollback config round trip',{
  skip:!available&&!process.env.CI?'Docker Compose CLI is unavailable locally; mandatory in CI':false,
},()=>{
  assert(available,'Docker Compose must be available in CI');
  const script=fs.readFileSync(path.join(__dirname,'finance-deploy.sh'),'utf8').replace(/\r\n/g,'\n');
  const match=script.match(/# BASELINE_CONFIG_BEGIN\nnode - "\$backup" <<'NODE'\n([\s\S]*?)\nNODE\n# BASELINE_CONFIG_END/);assert(match);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'finance-compose-render-'));
  const escape=value=>value.replaceAll('$',()=> '$$');
  const raw={AUTH_SECRET:'single$x-double$$x-braced${NAME}-tail$',ALRAJHI_TRANPORTAL_PASSWORD:'fixture$word$$pair${NAME}'};
  const expected=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,escape(value)]));
  const source={name:'finance-render-fixture',services:{app:{image:'busybox:stable',environment:expected,healthcheck:{test:['CMD-SHELL','test -n "$$TOKEN"']}}}};
  const render=file=>{
    const result=spawnSync('docker',['compose','--project-directory',dir,'--env-file',path.join(dir,'empty.env'),'-f',file,'config','--format','json'],{
      cwd:dir,encoding:'utf8',timeout:20000,env:{...process.env,NAME:'hostile-ambient-name',TOKEN:'hostile-ambient-token'},
    });
    assert.equal(result.status,0,'Synthetic Compose config must render successfully');
    return JSON.parse(result.stdout);
  };
  try{
    fs.writeFileSync(path.join(dir,'empty.env'),'');
    fs.writeFileSync(path.join(dir,'source.json'),JSON.stringify(source));
    const baseline=render(path.join(dir,'source.json'));
    assert.deepEqual(baseline.services.app.environment,expected,'rendered JSON must encode each literal dollar exactly once');
    fs.writeFileSync(path.join(dir,'baseline-compose.json'),JSON.stringify(baseline));
    fs.writeFileSync(path.join(dir,'container-before.json'),JSON.stringify([{Config:{Env:Object.entries({...raw,NODE_ENV:'production'}).map(([key,value])=>key+'='+value)},Mounts:[]}]));
    fs.writeFileSync(path.join(dir,'image-id.txt'),'sha256:'+'a'.repeat(64)+'\n');
    const guard=spawnSync(process.execPath,['-',dir],{input:match[1],encoding:'utf8',timeout:15000});
    assert.equal(guard.status,0,'The exact serialized representation of runtime values must pass');
    assert.equal(guard.stdout,'');
    const rollback=JSON.parse(fs.readFileSync(path.join(dir,'rollback-compose.json'),'utf8'));
    assert.deepEqual(rollback.services.app.healthcheck,baseline.services.app.healthcheck);
    const renderedAgain=render(path.join(dir,'rollback-compose.json'));
    assert.deepEqual(renderedAgain.services.app.environment,{...expected,NODE_ENV:'production'});
    assert.deepEqual(renderedAgain.services.app.healthcheck,baseline.services.app.healthcheck,'commands must not acquire an extra dollar-escape layer');
  }finally{
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
    assert(path.basename(dir).startsWith('finance-compose-render-'));
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
