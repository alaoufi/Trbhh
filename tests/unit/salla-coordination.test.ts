import {spawnSync} from 'node:child_process';
import {describe, expect, it} from 'vitest';

describe('executable Salla release coordination', () => {
  for (const scenario of ['explicit-exit', 'command-failure', 'success', 'cancel-delayed-worker', 'duplicate-rollback', 'stop-failure']) {
    it(scenario, () => {
      const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
      const result = spawnSync(bash, ['tests/fixtures/salla-coordination.sh', scenario], {encoding: 'utf8', timeout: 15000});
      expect(result.stderr).toBe('');
      expect(result.status, result.stdout).toBe(0);
    });
  }
  it.skipIf(process.platform === 'win32')('Linux flock serializes simultaneous watchdog and failure rollback', () => {
    const result = spawnSync('bash', ['tests/fixtures/salla-coordination.sh', 'concurrent-rollback'], {encoding: 'utf8', timeout: 15000});
    expect(result.stderr).toBe('');
    expect(result.status, result.stdout).toBe(0);
  });
});
