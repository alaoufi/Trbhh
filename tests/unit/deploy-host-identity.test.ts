import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('pins the production SSH identity rather than bypassing verification', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
  expect(workflow).toContain('secrets.VPS_KNOWN_HOSTS');
  expect(workflow).toContain('test -n "$VPS_KNOWN_HOSTS"');
  expect(workflow).toContain('StrictHostKeyChecking=yes');
  expect(workflow).not.toContain('StrictHostKeyChecking=no');
  expect(workflow).not.toContain('UserKnownHostsFile=/dev/null');
});
