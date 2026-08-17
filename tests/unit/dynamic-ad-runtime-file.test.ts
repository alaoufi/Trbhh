import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('dynamic ads runtime bootstrap asset', () => {
  it('keeps the pilot SQL migration in the Docker build context', () => {
    const dockerignore = fs.readFileSync(path.join(process.cwd(), '.dockerignore'), 'utf8');
    expect(dockerignore).toContain('!database/2026-08-17-dynamic-ads.sql');
  });
});
