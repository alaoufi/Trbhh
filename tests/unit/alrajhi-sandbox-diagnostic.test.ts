import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Al Rajhi Sandbox diagnostic', () => {
  it('returns the gateway rejection code to the private admin page without exposing credentials', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/actions.ts'), 'utf8');
    expect(source).toContain('encodeURIComponent(safeGatewayReason(result.error))');
  });
});
