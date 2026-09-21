import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe, expect, it} from 'vitest';

describe('owner invitation operations', () => {
  const workflow = readFileSync('.github/workflows/integration-readiness.yml', 'utf8');
  const job = workflow.split('  owner-invite:')[1];
  const condition = job.match(/^    if: (.+)$/m)![1];
  const gate = readFileSync('scripts/release/issue-owner-invite.sh', 'utf8');
  it.each([
    ['workflow_dispatch', 'codex/salla-owner-release-20260921', true, true],
    ['workflow_dispatch', 'codex/salla-owner-release-20260921', false, false],
    ['push', 'codex/salla-owner-release-20260921', true, false],
    ['workflow_dispatch', 'claude/hostinger-vps-project-amw8vb', true, false],
    ['workflow_dispatch', 'codex/salla-owner-release-20260921-other', true, false],
  ])('restricts %s/%s/%s', (event, branch, issue, allowed) => {
    expect(runInNewContext(condition, {github: {event_name:event, ref:`refs/heads/${branch}`}, inputs:{owner_invite:issue}}, {timeout:1000})).toBe(allowed);
  });
  it('requires the verified live revision before the encrypted operation', () => {
    expect(job).toContain('StrictHostKeyChecking=yes');
    expect(job).toContain('secrets.VPS_KNOWN_HOSTS');
    expect(gate).toContain('git rev-parse HEAD');
    expect(gate).toContain('/DEPLOYMENT_VERIFIED');
    expect(gate).toContain('/container-after.json');
    expect(gate).toContain('{{.Id}} {{.Image}}');
    expect(gate).toContain('{{.State.Running}} {{.State.Paused}}');
    expect(job).toContain('SALLA_AUDIT_REPORT_PUBLIC_KEY_B64');
    expect(gate.indexOf('/DEPLOYMENT_VERIFIED')).toBeLessThan(gate.indexOf('docker compose exec -T app node -'));
    expect(job).not.toContain('ssh-keyscan');
    expect(job).not.toContain('StrictHostKeyChecking=no');
  });
});
