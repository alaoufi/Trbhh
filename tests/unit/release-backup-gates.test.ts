import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

describe('production backup gates', () => {
  const workflow = readFileSync('.github/workflows/release-safeguards.yml', 'utf8');
  const script = readFileSync('scripts/release/safeguards.sh', 'utf8');
  const deploy = readFileSync('scripts/release/finance-deploy.sh', 'utf8');
  it('requires a pinned SSH host identity', () => {
    expect(workflow).toContain('secrets.VPS_KNOWN_HOSTS');
    expect(workflow).toContain('test -n "$VPS_KNOWN_HOSTS"');
    expect(workflow).not.toContain('ssh-keyscan');
  });
  it('permits preview branch only for manual before-backup', () => {
    expect(workflow).toContain("github.ref == 'refs/heads/codex/trbhh-v2-preview' && github.event_name == 'workflow_dispatch' && inputs.phase == 'before'");
  });
  it('pins the freshly verified live revision and retains restore proof', () => {
    expect(script).toContain('"$current_commit" == 021c5fe43f9a6361f7a0df66bf35e92f38e0cf06');
    expect(script).toContain('verify-restore "$backup/before.json" "$backup/restored.json"');
    expect(script).toContain('--event-scheduler=OFF');
  });
  it('reclaims a stale deployment marker only after proving the exact old image and baseline', () => {
    const recovery = deploy.slice(deploy.indexOf('recover_stale_active_release() {'), deploy.indexOf('\nfinish() {'));
    expect(recovery).toContain('sha256sum --check --status SHA256SUMS');
    expect(recovery).toContain('$(git rev-parse HEAD)" == "$stale_baseline"');
    expect(recovery).toContain('docker image inspect -f');
    expect(recovery).toContain('/api/version');
    expect(recovery).toContain('commerce_purchasing_enabled');
    expect(recovery.indexOf('rm -f -- "$active_release"')).toBeGreaterThan(recovery.indexOf('commerce_purchasing_enabled'));
    expect(deploy.indexOf('recover_stale_active_release') < deploy.indexOf('[[ ! -e "$active_release"')).toBe(true);
  });
  it('accepts media reuse only from a distinct numeric before-run source', () => {
    expect(workflow).toContain('reuse_media_id:');
    expect(workflow).toContain('REUSE_MEDIA_ID: ${{ inputs.reuse_media_id }}');
    expect(script).toContain('reuse_media_id=${4:-}');
    expect(script).toContain('"$phase" == before && "$reuse_media_id" =~ ^[0-9]+$ && "$reuse_media_id" != "$backup_id"');
    expect(script).toContain('"$(realpath "$reuse_source")" == "$reuse_source"');
    expect(script).toContain('"$(cat "$reuse_source/commit.txt")" == "$current_commit"');
  });
  it('validates copied media in the new directory before arming the pause guard', () => {
    const preparation = script.indexOf('# Prepare reused media before the guarded pause.');
    const guard = script.indexOf('systemd-run --unit="$watchdog"');
    expect(preparation).toBeGreaterThan(0);
    expect(preparation).toBeLessThan(guard);
    const block = script.slice(preparation, guard);
    expect(block).toContain('! -L "$reuse_source/$label.tar.gz"');
    expect(block).toContain('! -L "$reuse_source/$label.path"');
    expect(block).toContain('cp --reflink=auto -- "$reuse_source/$label.tar.gz" "$backup/$label.tar.gz"');
    expect(block).toContain('gzip -t "$backup/$label.tar.gz"');
    expect(block).toContain('snapshot "$backup/$label-extracted"');
    expect(block).not.toContain('database.sql');
  });
  it('requires exact current media, fresh database proof, and the original watchdog', () => {
    expect(script).toContain('verify "$backup/$label-current.json" "$backup/$label-before.json"');
    expect(script).toContain('node - dump < "$tools_dir/database-proof.cjs" | gzip > "$backup/database.sql.gz"');
    expect(script).toContain('--on-active=15m');
    expect(script).toContain('verify-restore-full "$backup/full-before.json" "$backup/full-restored.json"');
    expect(script).toContain('verify-restore-full "$backup/full-before.json" "$backup/full-current.json"');
    expect(script).not.toContain('> "$reuse_source/VERIFIED"');
  });
  it('bidirectional media proof rejects additions and same-size content changes', () => {
    const { verify } = createRequire(import.meta.url)('../../scripts/release/media-proof.cjs');
    const file = { path: 'fixture', kind: 'file', bytes: 1, sha256: 'a'.repeat(64) };
    const manifest = (entries: object[]) => ({ format: 'trbhh-media-proof-v1', capturedAt: '2026-09-19T00:00:00Z', entryCount: entries.length, entries });
    const original = manifest([file]);
    const added = manifest([file, { ...file, path: 'added' }]);
    expect(verify(original, original).ok).toBe(true);
    expect(verify(original, added).ok).toBe(true);
    expect(verify(added, original).ok).toBe(false);
    expect(verify(original, manifest([{ ...file, sha256: 'b'.repeat(64) }])).ok).toBe(false);
  });
  it.each([
    ['workflow_dispatch', 'codex/commerce-approved-goods-20260919', 'before', true],
    ['workflow_dispatch', 'codex/commerce-approved-goods-20260919', 'after', false],
    ['push', 'codex/commerce-approved-goods-20260919', 'before', false],
    ['workflow_dispatch', 'codex/commerce-approved-goods-20260919-other', 'before', false],
    ['workflow_dispatch', 'claude/hostinger-vps-project-amw8vb', 'after', true],
    ['workflow_dispatch', 'codex/trbhh-v2-preview', 'after', false],
  ])('gates dispatch %s / %s / %s', (event, branch, phase, allowed) => {
    const condition = workflow.split('  safeguard:')[1].match(/^    if: (.+)$/m)?.[1];
    expect(condition).toBeDefined();
    expect(runInNewContext(condition!, {
      github: { event_name: event, ref: `refs/heads/${branch}` }, inputs: { phase },
    }, { timeout: 1000 })).toBe(allowed);
  });
  it('freezes the app only after creating recovery artifacts and always resumes it', () => {
    expect(script).toContain('docker pause "$container"');
    expect(script).toContain('docker unpause "$container"');
    expect(script).toContain('trap resume_production EXIT');
    expect(script.indexOf('docker image save')).toBeLessThan(script.indexOf('docker pause "$container"'));
    expect(script.indexOf('tar -czf - -C "$media_path"')).toBeLessThan(script.indexOf('docker pause "$container"'));
    expect(script).toContain('verify-restore-full "$backup/full-before.json" "$backup/full-restored.json"');
    expect(script).toContain('verify-restore-full "$backup/full-before.json" "$backup/full-current.json"');
    expect(script).toContain('--volumes-from "$container:ro"');
  });
});
