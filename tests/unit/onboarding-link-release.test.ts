import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';

const workflow=readFileSync('.github/workflows/release-safeguards.yml','utf8');
const script=readFileSync('scripts/release/safeguards.sh','utf8');
const runtime=readFileSync('scripts/release/verify-runtime.cjs','utf8');
const helper=readFileSync('scripts/release/onboarding-link-media-reference.cjs','utf8');
const baseline='c1fbdf0e18f263c1881b4092ae8ddad74cc87b98',checkpoint='35642667045',candidate='f'.repeat(40);
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const shell=(source:string)=>spawnSync(bash,['-c',source],{encoding:'utf8',timeout:10000,env:process.env});

describe('supplier onboarding and owner-link production release',()=>{
 it('selects only the pinned current-production checkpoint',()=>{
  const expression=workflow.match(/^          RELEASE_PROFILE: \$\{\{ (.+) \}\}$/m)?.[1];
  expect(expression).toBeDefined();
  expect(runInNewContext(expression!,{github:{ref:'refs/heads/codex/supplier-visual-selection-20260921'},inputs:{reuse_media_id:checkpoint}},{timeout:1000})).toBe('onboarding_link');
 });
 it('rejects a different checkpoint and pins the live baseline',()=>{
  const prefix=script.slice(0,script.indexOf('\nprod=/root/trbhh'));
  expect(shell(`set -- before 999 ${candidate} ${checkpoint} onboarding_link\n${prefix}`).status).toBe(0);
  expect(shell(`set -- before 999 ${candidate} 123 onboarding_link\n${prefix}`).status).not.toBe(0);
  expect(script).toContain(`current_commit\" == ${baseline}`);
 });
 it('chains the verified live checkpoint and all preservation proofs',()=>{
  expect(helper).toContain(`const CHECKPOINT_ID='${checkpoint}'`);
  expect(helper).toContain(`const CURRENT='${baseline}'`);
  expect(helper).toContain('bannerSeparation.verify(checkpoint,base).ok===true');
  expect(script).toContain('onboarding-link-media-reference.cjs" prepare');
  expect(script).toContain('onboarding-link-media-reference.cjs" verify');
  expect(script).toContain('verify-known-migration "$backup/before.json" "$backup/after.json" msg_topup_ok_v1');
  expect(runtime).toContain("'onboarding_link'");
 });
 it('allows only the deployed candidate as a one-time after-proof override',()=>{
  expect(workflow).toContain('candidate_sha:');
  expect(workflow).toContain("\"$PHASE\" == after && \"$RELEASE_PROFILE\" == onboarding_link && \"$CANDIDATE_SHA\" == 408fb10d18ddad9f83259ffd8d006e441e6a6515");
  expect(workflow).toContain("'$CANDIDATE_SHA' '$REUSE_MEDIA_ID' '$RELEASE_PROFILE'");
 });
});
