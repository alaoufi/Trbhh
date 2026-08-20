import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Al Rajhi runtime environment', () => {
  it('passes every private Sandbox variable from the server env into the app container', () => {
    const compose = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
    for (const key of ['ALRAJHI_ENVIRONMENT', 'ALRAJHI_TRANPORTAL_ID', 'ALRAJHI_TRANPORTAL_PASSWORD', 'ALRAJHI_TERMINAL_RESOURCE_KEY', 'ALRAJHI_PAYMENT_GATEWAY_URL', 'ALRAJHI_TRANPORTAL_GATEWAY_URL', 'DATABASE_PAYMENT_SECRET']) {
      expect(compose).toContain(`${key}:`);
    }
  });
});
