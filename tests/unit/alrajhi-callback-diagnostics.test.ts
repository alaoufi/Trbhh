import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Al Rajhi callback diagnostics', () => {
  it('returns a safe validation code without exposing the bank payload', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/pay/callback/[provider]/route.ts'), 'utf8');
    expect(source).toContain('inspectAlrajhiCallback');
    expect(source).toContain('errorCode: validation.gatewayCode || validation.reason');
    expect(source).not.toContain('JSON.stringify(body)');
  });
});
