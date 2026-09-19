import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const script = readFileSync('scripts/release/storage-maintenance.sh', 'utf8');
const workflow = readFileSync('.github/workflows/trbhh-storage-maintenance.yml', 'utf8');
describe('one-off backup cleanup safety', () => {
  it('defaults to audit and serializes with production operations', () => {
    expect(script).toContain('mode=${1:-audit}');
    expect(script).toContain('if [[ "$mode" == cleanup ]]');
    expect(workflow).toContain("MODE: ${{ inputs.mode || 'audit' }}");
    expect(workflow).toContain('group: vps-deploy');
  });
  it('keeps the newly verified release backup and deletes only its predecessor', () => {
    const targets = script.match(/targets=\(([\s\S]*?)\n  \)/)![1].trim().split(/\s+/);
    expect(targets).toEqual(['/root/trbhh-release-backups/audit-35459832130']);
    expect(script).toContain('keep=/root/trbhh-release-backups/audit-35465592273');
    expect(script).toContain('[[ "$(cat "$keep/DEPLOYMENT_VERIFIED")" == ab5a641580e00678f66b071a576676ea7adfb191 ]]');
    expect(targets.every(p => /^\/root\/trbhh-release-backups\/audit-\d+$/.test(p) || /^\/root\/trbhh\/backups\/تربح-\d{8}-\d{4}\.zip$/.test(p))).toBe(true);
  });
  it('validates retained archives and resolves paths and mounts before deletion', () => {
    const deletion = script.indexOf('rm -rf --one-file-system');
    for (const check of ['sha256sum --strict --check SHA256SUMS', 'gzip -t', '$(realpath "$target")', 'findmnt -rn -o TARGET', 'Backup target is mounted', 'A backup process is still active']) {
      expect(script.indexOf(check)).toBeGreaterThan(0);
      expect(script.indexOf(check)).toBeLessThan(deletion);
    }
    expect(script).toContain('[[ "$target" != "$keep" && ! -L "$target" ]]');
    expect(script).not.toContain('docker system prune');
    expect(script).not.toContain('docker volume rm');
  });
  it('rejects Docker mounts containing a deletion target as well as nested mounts', () => {
    expect(script).toContain('done <<< "$docker_mounts"');
    expect(script).toContain('"$target" != "$mount/"*');
  });
});
