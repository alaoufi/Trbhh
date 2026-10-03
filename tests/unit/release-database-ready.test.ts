import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('isolated MySQL readiness', () => {
  const script = readFileSync('scripts/release/final-gate-prepare.sh', 'utf8');
  it('waits for the final TCP server instead of the temporary initialization socket', () => {
    expect(script).toContain('mysql --protocol=TCP -h127.0.0.1 -uroot -Nse');
  });
  it('restores using the same verified transport', () => {
    expect(script).toContain("mysql --protocol=TCP -h127.0.0.1 -uroot' <");
  });
});
