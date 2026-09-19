import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('production aggregate audit workflow',()=>{
  it('uses the pinned host and sends only the standalone read-only audit over stdin',()=>{
    const workflow=readFileSync('.github/workflows/trbhh-v2-preview.yml','utf8');
    const inspect=workflow.split('  inspect-live:\n')[1]?.split('  preview:\n')[0]
      || workflow.split('  inspect-live:\r\n')[1]?.split('  preview:\r\n')[0];
    expect(inspect).toBeTruthy();
    expect(inspect).toContain('secrets.VPS_KNOWN_HOSTS');
    expect(inspect).not.toContain('ssh-keyscan');
    expect(inspect).toContain('StrictHostKeyChecking=yes');
    expect(inspect).toContain('docker compose exec -T app node');
    expect(inspect).toContain('< scripts/preview/audit-production.cjs');
    expect(inspect).not.toMatch(/git (?:pull|reset)|compose up|prisma db push/);
  });
});
