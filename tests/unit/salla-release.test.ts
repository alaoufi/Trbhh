import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const require=createRequire(import.meta.url);
describe('Salla release environment preparation',()=>{
 it('preserves every unrelated setting and existing persistent keys',()=>{
  const {prepareEnvironment,verifyEnvironment}=require('../../scripts/release/salla-environment.cjs');
  const before=`DATABASE_URL=private\nAUTH_SECRET=unchanged\nSUPPLIER_TOKEN_ENCRYPTION_KEY=${'a'.repeat(64)}\nSUPPLIER_RECONCILE_SECRET=${'b'.repeat(64)}\n`;
  const after=prepareEnvironment(before,{SALLA_CLIENT_ID:'id',SALLA_CLIENT_SECRET:'secret',SALLA_WEBHOOK_SECRET:'webhook'});
  expect(after).toContain('DATABASE_URL=private\nAUTH_SECRET=unchanged');expect(after).toContain('a'.repeat(64));expect(after).toContain('b'.repeat(64));expect(after).toContain('SUPPLIER_ALLOW_LIVE_ORDERS=false');expect(after).toContain('SUPPLIER_PUBLIC_ORIGIN=https://trbhh.sa');expect(()=>verifyEnvironment(before,after)).not.toThrow();
  expect(()=>verifyEnvironment(before,after.replace('AUTH_SECRET=unchanged','AUTH_SECRET=changed'))).toThrow();
 });
 it('rejects missing secrets, multiline input and malformed preexisting keys',()=>{
  const {prepareEnvironment}=require('../../scripts/release/salla-environment.cjs');const input={SALLA_CLIENT_ID:'id',SALLA_CLIENT_SECRET:'secret',SALLA_WEBHOOK_SECRET:'webhook'};
  expect(()=>prepareEnvironment('',{})).toThrow();expect(()=>prepareEnvironment('',{...input,SALLA_CLIENT_SECRET:'bad\nsecret'})).toThrow();expect(()=>prepareEnvironment('SUPPLIER_TOKEN_ENCRYPTION_KEY=\n',input)).toThrow();
 });
 it('new workflow is manual, pinned, exact-ref and stages only after backup',()=>{
  const workflow=readFileSync('.github/workflows/salla-release-prepare.yml','utf8');
  expect(workflow).toContain('workflow_call:');expect(workflow).not.toMatch(/^  push:/m);expect(workflow).toContain('secrets.VPS_KNOWN_HOSTS');expect(workflow).not.toContain('ssh-keyscan');expect(workflow).toContain('ref: ${{ github.sha }}');expect(readFileSync('.github/workflows/release-safeguards.yml','utf8')).toContain('group: vps-deploy');expect(workflow).toContain('needs: quality');expect(workflow).not.toContain('docker compose up');
 });
 it('compose exception permits only seven exact Salla environment declarations',()=>{
  const {verifyCompose}=require('../../scripts/release/salla-environment.cjs');
  const before='services:\n  app:\n    environment:\n      AUTH_SECRET: unchanged\n';
  expect(()=>verifyCompose(before,before+'      SALLA_CLIENT_ID: ${SALLA_CLIENT_ID:-}\n')).not.toThrow();
  expect(()=>verifyCompose(before,before.replace('unchanged','changed'))).toThrow();
 });
 it('rolls back both pre-checkout schema failure and post-checkout failure without restoring DB',()=>{
  const rollback=readFileSync('scripts/release/salla-rollback.sh','utf8');
  expect(rollback).toContain('"$head" == "$candidate" || "$head" == eda1e8cb400a90418b57ad5d0b5f97bc3e8fee96');expect(rollback).not.toContain('database.sql');expect(rollback).toContain('--no-build --pull never');
  const activation=readFileSync('scripts/release/salla-activate.sh','utf8');
  const cutover=readFileSync('scripts/release/salla-cutover.sh','utf8');
  expect(activation.indexOf('docker build')).toBeLessThan(activation.indexOf('systemd-run --unit="$unit"'));
  expect(cutover.indexOf(' - apply <')).toBeLessThan(cutover.indexOf('git switch --detach'));expect(cutover).toContain('SUPPLIER_ALLOW_LIVE_ORDERS!=="false"');expect(cutover).toContain('for route in / /login /shop /guide');
  expect(activation).toContain('trap salla_exit_cleanup EXIT');expect(activation).not.toContain('systemctl stop "$timer.service"');
  expect(readFileSync('.github/workflows/salla-release-prepare.yml','utf8')).not.toContain('concurrency:');
 });
});
