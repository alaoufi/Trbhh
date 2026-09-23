import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('pins the production SSH identity rather than bypassing verification', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
  expect(workflow).toContain('secrets.VPS_KNOWN_HOSTS');
  expect(workflow).toContain('StrictHostKeyChecking=yes');
  expect(workflow).not.toContain('StrictHostKeyChecking=no');
  expect(workflow).not.toContain('UserKnownHostsFile=/dev/null');
});

it('refuses missing SSH credentials or pinned host identity before creating files or connecting', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8').replace(/\r\n/g, '\n');
  const preflight = workflow.match(/          set \+x \+v\n([\s\S]*?)(?=          printf '%s\\n' "\$VPS_SSH_KEY")/)?.[0];
  expect(preflight).toBeDefined();
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  for (const [key, hosts, ready] of [['', 'synthetic-host', false], ['synthetic-key', '', false], ['synthetic-key', 'synthetic-host', true]] as const) {
    const result = spawnSync(bash, ['-c', preflight + '\nprintf ready'], {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, GITHUB_RUN_ID: '123', GITHUB_SHA: 'a'.repeat(40), VPS_HOST: 'example.invalid', VPS_USER: 'deploy', VPS_PORT: '22', VPS_SSH_KEY: key, VPS_KNOWN_HOSTS: hosts },
    });
    expect(result.status).toBe(ready ? 0 : 1);
    expect(result.stdout).toBe(ready ? 'ready' : '');
  }
});
