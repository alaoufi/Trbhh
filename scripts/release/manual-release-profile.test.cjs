'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {patch}=require('./manual-release-profile.cjs');
const source=fs.readFileSync(path.join(__dirname,'finance-deploy.sh'),'utf8');
test('manual release changes only the pinned branch and guarded preserved gate profile',()=>{const out=patch(source);assert(out.includes('branch=codex/cj-card-settlements-20261014'));assert(out.includes("git rev-parse \"refs/remotes/origin/$branch\""));assert.equal((out.match(/releaseGates\(rows,env=/g)||[]).length,2);for(const marker of ['verify_retained_media','ROLLBACK_REQUESTED','prove_preservation','flock -w 600','git merge-base --is-ancestor'])assert(out.includes(marker));});
test('source drift is rejected instead of silently bypassing a release guard',()=>{assert.throws(()=>patch(source.replace('branch=claude/hostinger-vps-project-amw8vb','branch=other')));assert.throws(()=>patch(source.replace('SELECT v FROM site_settings','SELECT other FROM site_settings')));});
