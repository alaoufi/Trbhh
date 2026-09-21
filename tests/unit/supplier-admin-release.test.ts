import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';
const workflow=readFileSync('.github/workflows/release-safeguards.yml','utf8');
const script=readFileSync('scripts/release/safeguards.sh','utf8');
const runtime=readFileSync('scripts/release/verify-runtime.cjs','utf8');
const helper=readFileSync('scripts/release/supplier-admin-media-reference.cjs','utf8');
const baseline='b5bf261a7a03cf28cbdca8387363616e0386b9e8',checkpoint='35637559322',candidate='d'.repeat(40);
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const shell=(source:string,env:Record<string,string>={})=>spawnSync(bash,['-c',source],{encoding:'utf8',timeout:10000,env:{...process.env,...env}});
describe('supplier administration production release',()=>{
 it('selects only the pinned current-production checkpoint on the feature branch',()=>{const expression=workflow.match(/^          RELEASE_PROFILE: \$\{\{ (.+) \}\}$/m)?.[1];expect(expression).toBeDefined();expect(runInNewContext(expression!,{github:{ref:'refs/heads/codex/supplier-visual-selection-20260921'},inputs:{reuse_media_id:checkpoint}},{timeout:1000})).toBe('supplier_admin');});
 it('rejects a different checkpoint and baseline',()=>{const prefix=script.slice(0,script.indexOf('\nprod=/root/trbhh'));expect(shell(`set -- before 999 ${candidate} ${checkpoint} supplier_admin\n${prefix}`).status).toBe(0);expect(shell(`set -- before 999 ${candidate} 123 supplier_admin\n${prefix}`).status).not.toBe(0);expect(script).toContain(`current_commit" == ${baseline}`);});
 it('pins the verified parent and all preservation proofs',()=>{expect(helper).toContain(`const CHECKPOINT_ID='${checkpoint}'`);expect(helper).toContain(`const CURRENT='${baseline}'`);expect(helper).toContain('loyalty.verify(checkpoint,base).ok===true');expect(script).toContain('supplier-admin-media-reference.cjs" prepare');expect(script).toContain('supplier-admin-media-reference.cjs" verify');expect(runtime).toContain("'supplier_admin'");});
});
