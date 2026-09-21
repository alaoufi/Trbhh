import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';

const workflow=readFileSync('.github/workflows/release-safeguards.yml','utf8');
const script=readFileSync('scripts/release/safeguards.sh','utf8');
const runtime=readFileSync('scripts/release/verify-runtime.cjs','utf8');
const helper=readFileSync('scripts/release/catalog-management-media-reference.cjs','utf8');
const baseline='6dc58319b9d570c32f4c983491e8950689292b31',checkpoint='35656382084',candidate='f'.repeat(40);
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
const shell=(source:string)=>spawnSync(bash,['-c',source],{encoding:'utf8',timeout:10000,env:process.env});

describe('supplier catalog management production release',()=>{
 it('selects only its exact verified parent checkpoint',()=>{
  const expression=workflow.match(/^          RELEASE_PROFILE: \$\{\{ (.+) \}\}$/m)?.[1];
  expect(expression).toBeDefined();
  expect(runInNewContext(expression!,{github:{ref:'refs/heads/codex/supplier-visual-selection-20260921'},inputs:{reuse_media_id:checkpoint}},{timeout:1000})).toBe('catalog_management');
 });
 it('rejects another checkpoint and pins the current live baseline',()=>{
  const prefix=script.slice(0,script.indexOf('\nprod=/root/trbhh'));
  expect(shell(`set -- before 999 ${candidate} ${checkpoint} catalog_management\n${prefix}`).status).toBe(0);
  expect(shell(`set -- before 999 ${candidate} 123 catalog_management\n${prefix}`).status).not.toBe(0);
  expect(script).toContain(`current_commit\" == ${baseline}`);
 });
 it('chains the verified onboarding release and preserves supplier runtime',()=>{
  expect(helper).toContain(`const CHECKPOINT_ID='${checkpoint}'`);
  expect(helper).toContain("const BASELINE='1b700dbdcb7d6a2c6fba8ea2cc03cb50aeb20b7d'");
  expect(helper).toContain(`const CURRENT='${baseline}'`);
  expect(helper).toContain('onboardingAudit.verify(checkpoint,base).ok===true');
  expect(script).toContain('catalog-management-media-reference.cjs\" prepare');
  expect(script).toContain('catalog-management-media-reference.cjs\" verify');
  expect(runtime).toContain("'catalog_management'");
 });
});
