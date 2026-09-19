import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('production backup gates', () => {
  const workflow = readFileSync('.github/workflows/release-safeguards.yml', 'utf8');
  const script = readFileSync('scripts/release/safeguards.sh', 'utf8');
  it('requires a pinned SSH host identity', () => {
    expect(workflow).toContain('secrets.VPS_KNOWN_HOSTS');
    expect(workflow).toContain('test -n "$VPS_KNOWN_HOSTS"');
    expect(workflow).not.toContain('ssh-keyscan');
  });
  it('permits preview branch only for manual before-backup', () => {
    expect(workflow).toContain("github.ref == 'refs/heads/codex/trbhh-v2-preview' && github.event_name == 'workflow_dispatch' && inputs.phase == 'before'");
  });
  it('pins the freshly verified live revision and retains restore proof', () => {
    expect(script).toContain('"$current_commit" == ec75f2862079107c742d8b8d903c24c5da5748da');
    expect(script).toContain('verify-restore "$backup/before.json" "$backup/restored.json"');
    expect(script).toContain('--event-scheduler=OFF');
  });
  it.each([
    ['workflow_dispatch', 'codex/commerce-approved-goods-20260919', 'before', true],
    ['workflow_dispatch', 'codex/commerce-approved-goods-20260919', 'after', false],
    ['push', 'codex/commerce-approved-goods-20260919', 'before', false],
    ['workflow_dispatch', 'codex/commerce-approved-goods-20260919-other', 'before', false],
    ['workflow_dispatch', 'claude/hostinger-vps-project-amw8vb', 'after', true],
    ['workflow_dispatch', 'codex/trbhh-v2-preview', 'after', false],
  ])('gates dispatch %s / %s / %s', (event, branch, phase, allowed) => {
    const condition = workflow.match(/^    if: (.+)$/m)?.[1];
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
    expect(script).toContain('verify-restore-full "$backup/full-before.json" "$backup/full-restored.json"');
    expect(script).toContain('verify-restore-full "$backup/full-before.json" "$backup/full-current.json"');
    expect(script).toContain('--volumes-from "$container:ro"');
  });
});
