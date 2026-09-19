import { readFileSync } from 'node:fs';
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
    expect(script).toContain('"$current_commit" == 1e0547073567700e6bb5fe8ac663a86770767ab6');
    expect(script).toContain('verify-restore "$backup/before.json" "$backup/restored.json"');
    expect(script).toContain('--event-scheduler=OFF');
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
