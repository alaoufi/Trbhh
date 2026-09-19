import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {CATEGORY_SEED_TEMPLATES} from '@/lib/ad-categories/seed-templates';
import {validateDefinition} from '@/lib/ad-categories/validation';
const require=createRequire(import.meta.url);
const script=require('../../scripts/release/activate-categories.cjs');
function fixture(){
  const payload=script.buildPayload();
  const state={
    cats:[{id:1n,name:payload.templates[0].categoryName,is_active:'no'}],
    subs:[{id:1n,category_id:1,name:payload.templates[0].name,active:0}],
    defs:[{subcategory_id:1n,version:8,fields_json:'{"custom":"untouched"}'}],
    settings:[{k:'wallet_key',v:'private-fixture'},{k:'commerce_enabled',v:'0'},{k:'commerce_payments_enabled',v:'0'},{k:'commerce_notifications_enabled',v:'0'}],
    apis:[] as {id:bigint}[],triggers:[] as {t:string}[],database:'fixture',last:1n,
  };
  const writes:string[]=[];
  const schema={
    categories:['id','name','photo_path','is_active','ordered'],sub_categories:['id','category_id','name','order','active'],
    ad_category_definitions:['subcategory_id','version','kind','price_enabled','goods_enabled','fields_json'],
    ad_category_values:['ad_id','subcategory_id','definition_version','values_json'],site_settings:['k','v'],commerce_suppliers:['id','api_enabled'],
  };
  let failFinal=false;
  const tx={
    async $queryRawUnsafe(sql:string){
      if(sql==='SELECT DATABASE() AS db')return [{db:state.database}];
      if(sql.includes('information_schema.TABLES'))return Object.keys(schema).map(t=>({t,engine:'InnoDB'}));
      if(sql.includes('information_schema.COLUMNS'))return Object.entries(schema).flatMap(([t,cols])=>cols.map(c=>({t,c})));
      if(sql.includes('KEY_COLUMN_USAGE'))return Object.entries(schema).map(([t,cols])=>({t,c:cols[0]}));
      if(sql.includes('information_schema.TRIGGERS'))return state.triggers;
      if(sql.includes('FROM categories '))return structuredClone(state.cats);
      if(sql.includes('FROM sub_categories '))return structuredClone(state.subs);
      if(sql.includes('FROM ad_category_definitions '))return structuredClone(state.defs);
      if(sql.includes('FROM site_settings '))return structuredClone(state.settings);
      if(sql.includes('FROM commerce_suppliers '))return state.apis;
      if(sql==='SELECT LAST_INSERT_ID() AS id')return [{id:state.last}];
      throw new Error('unexpected query');
    },
    async $executeRawUnsafe(sql:string,...args:unknown[]){
      writes.push(sql);
      if(sql.startsWith('INSERT INTO categories ')){state.last=BigInt(state.cats.length+1);state.cats.push({id:state.last,name:String(args[0]),is_active:'yes'});}
      else if(sql.startsWith('INSERT INTO sub_categories ')){state.last=BigInt(state.subs.length+1);state.subs.push({id:state.last,category_id:Number(args[0]),name:String(args[1]),active:1});}
      else if(sql.startsWith('INSERT INTO ad_category_definitions '))state.defs.push({subcategory_id:BigInt(String(args[0])),version:1,fields_json:String(args[4])});
      else if(sql.startsWith('UPDATE categories '))state.cats.find(c=>c.id===args[0])!.is_active='yes';
      else if(sql.startsWith('UPDATE sub_categories '))state.subs.find(s=>s.id===args[0])!.active=1;
      else if(sql.startsWith('INSERT INTO site_settings ')){
        if(failFinal)throw new Error('fixture_failure');
        const row=state.settings.find(s=>s.k==='categories_v2_enabled');
        if(row)row.v='1';else state.settings.push({k:'categories_v2_enabled',v:'1'});
      }else throw new Error('unexpected write');
      return 1;
    },
  };
  const db={$transaction:async(fn:(client:typeof tx)=>Promise<unknown>)=>{
    const before=structuredClone(state);
    try{return await fn(tx);}catch(e){Object.assign(state,before);throw e;}
  }};
  const options={expectedDatabase:'fixture',baseline:'a'.repeat(40),backup:'123',backupVerified:true,payloadSha256:script.sha256(JSON.stringify(payload))};
  return {db,state,writes,payload,options,fail:()=>{failFinal=true;}};
}

describe('operator category activation',()=>{
  it('stdin CLI invocation executes gates instead of silently succeeding',()=>{
    const result=spawnSync(process.execPath,['-','apply'],{input:readFileSync('scripts/release/activate-categories.cjs','utf8'),encoding:'utf8'});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Category activation refused');
    expect(result.stdout).toBe('');
  });
  it('workflow gates activation after exact deployed SHA and verified backup',()=>{
    const wf=readFileSync('.github/workflows/check-vps-env.yml','utf8');
    for(const gate of ["default: diagnose","inputs.action == 'diagnose'","inputs.action == 'activate_categories'",'group: vps-deploy','cancel-in-progress: false','ref: ${{ github.sha }}','secrets.VPS_KNOWN_HOSTS','StrictHostKeyChecking=yes','DEPLOYMENT_VERIFIED','git rev-parse HEAD','backup/VERIFIED','/root/trbhh-release-tools/']) expect(wf).toContain(gate);
    const activation=wf.slice(wf.indexOf('  activate_categories:'));
    expect(activation).not.toContain('StrictHostKeyChecking=no');
    expect(activation).not.toContain('ssh-keyscan');
    expect(activation).toContain('container-before.json');
    expect(activation).toContain('saved.Id!==process.argv[3] || saved.Image!==process.argv[4]');
    expect(activation).not.toContain('inputs.expected_database');
    expect(activation.indexOf('backup/DEPLOYMENT_VERIFIED')).toBeLessThan(activation.indexOf('node - apply'));
    expect(activation).toContain('set -o noclobber');
    expect(activation).toContain('result.protectedSettingsUnchanged!==true');
  });
  it('builds exactly the current real templates with the real validator',()=>{
    const payload=script.buildPayload();
    expect(payload.templates).toEqual(CATEGORY_SEED_TEMPLATES.map(t=>({...t,fields:validateDefinition(t.fields)})));
    expect(payload.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('refuses apply before any connection unless backup, baseline, database and payload hash are explicit',async()=>{
    const db={$transaction:vi.fn()};
    await expect(script.activate(db,script.buildPayload(),{})).rejects.toThrow('operator_gate');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects tampered payloads before transaction',async()=>{
    const payload=script.buildPayload(),raw=JSON.stringify(payload);
    const options={expectedDatabase:'fixture',baseline:'a'.repeat(40),backup:'verified-backup-1',backupVerified:true,payloadSha256:script.sha256(raw)};
    payload.templates[0].name='tampered';
    const db={$transaction:vi.fn()};
    await expect(script.activate(db,payload,options)).rejects.toThrow('payload_hash');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('is idempotent, preserves existing custom fields and never writes ads, members or money',async()=>{
    const f=fixture(),original=structuredClone(f.state.defs[0]),settings=structuredClone(f.state.settings);
    const first=await script.activate(f.db,f.payload,f.options);
    const after=structuredClone(f.state);
    const second=await script.activate(f.db,f.payload,f.options);
    expect(f.state).toEqual(after);expect(f.state.defs[0]).toEqual(original);
    expect(f.state.settings.filter(s=>s.k!=='categories_v2_enabled')).toEqual(settings);
    expect(first.protectedSettingsUnchanged).toBe(true);
    expect(second.definitionsAdded).toBe(0);expect(second.categoriesAdded).toBe(0);expect(second.subcategoriesAdded).toBe(0);
    expect(f.writes.every(sql=>/^(INSERT INTO (categories|sub_categories|ad_category_definitions|site_settings) |UPDATE (categories|sub_categories) )/.test(sql))).toBe(true);
    expect(JSON.stringify(first)).not.toContain('private-fixture');
  });
  it.each(['commerce_enabled','commerce_payments_enabled','commerce_notifications_enabled'])('refuses active %s without mutations',async key=>{
    const f=fixture();f.state.settings.find(s=>s.k===key)!.v='1';
    await expect(script.activate(f.db,f.payload,f.options)).rejects.toThrow('commerce_not_off');
    expect(f.writes).toEqual([]);
  });
  it('refuses supplier API activation without modifying supplier rows',async()=>{
    const f=fixture();f.state.apis.push({id:1n});
    await expect(script.activate(f.db,f.payload,f.options)).rejects.toThrow('supplier_api_not_off');
    expect(f.writes).toEqual([]);
  });
  it('rolls back all additions on late failure',async()=>{
    const f=fixture(),before=structuredClone(f.state);f.fail();
    await expect(script.activate(f.db,f.payload,f.options)).rejects.toThrow('fixture_failure');
    expect(f.state).toEqual(before);
  });
  it('refuses ambiguous existing categories without choosing or overwriting one',async()=>{
    const f=fixture();f.state.cats.push({...f.state.cats[0],id:2n});
    await expect(script.activate(f.db,f.payload,f.options)).rejects.toThrow('ambiguous_category');
    expect(f.writes).toEqual([]);
  });
  it('refuses a wrong database or triggers that could mutate protected rows',async()=>{
    const f=fixture();f.state.database='other';
    await expect(script.activate(f.db,f.payload,f.options)).rejects.toThrow('database_mismatch');
    f.state.database='fixture';f.state.triggers.push({t:'categories'});
    await expect(script.activate(f.db,f.payload,f.options)).rejects.toThrow('unexpected_trigger');
    expect(f.writes).toEqual([]);
  });
  it('requires schema before any category mutation',async()=>{
    const f=fixture();
    const db={$transaction:(fn:(tx:unknown)=>Promise<unknown>)=>f.db.$transaction(tx=>fn({
      ...tx,$queryRawUnsafe:(sql:string)=>sql.includes('information_schema.COLUMNS')?Promise.resolve([]):tx.$queryRawUnsafe(sql),
    }))};
    await expect(script.activate(db,f.payload,f.options)).rejects.toThrow('schema_not_ready');
    expect(f.writes).toEqual([]);
  });
});
