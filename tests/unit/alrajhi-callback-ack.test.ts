import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Al Rajhi callback acknowledgement', () => {
  it('acknowledges the bank notification before browser redirection', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/pay/callback/[provider]/route.ts'), 'utf8');
    expect(source).toContain("provider === 'alrajhi_arb'");
    expect(source).toContain("status: '1'");
    expect(source).toContain('inspectAlrajhiCallback');
  });

  it('reads the ARB POST body once before validating the acknowledgement', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/pay/callback/[provider]/route.ts'), 'utf8');
    expect(source).toContain("import { readAlrajhiCallbackBody } from '@/lib/payments/alrajhi-callback'");
    expect(source).toContain('const body = await readAlrajhiCallbackBody(req);');
  });

  it('stores the final encrypted transaction payment id before acknowledging ARB', () => {
    const callback = fs.readFileSync(path.join(process.cwd(), 'src/app/api/pay/callback/[provider]/route.ts'), 'utf8');
    const payments = fs.readFileSync(path.join(process.cwd(), 'src/lib/payments/index.ts'), 'utf8');
    expect(callback).toContain('await attachProviderRef(topupId, validation.providerRef);');
    expect(payments).toContain("const providerRef = String(data.transId || '');");
  });

  it('returns the public Trbhh callback URL to ARB instead of the internal container host', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/pay/callback/[provider]/route.ts'), 'utf8');
    expect(source).toContain("`https://${SITE.domain}${url.pathname}?t=${topupId}`");
  });

  it('redirects the payment result page to the public Trbhh domain', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/pay/callback/[provider]/route.ts'), 'utf8');
    expect(source).toContain("new URL('/payment/result', `https://${SITE.domain}`)");
  });
});
