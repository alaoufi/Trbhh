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

  it('validates the encrypted final transaction id before acknowledging ARB', () => {
    const payments = fs.readFileSync(path.join(process.cwd(), 'src/lib/payments/index.ts'), 'utf8');
    expect(payments).toContain("const providerRef = String(data.transId || '');");
    expect(payments).toContain('String(data.trackId || \'\')');
  });

  it('marks an explicit final bank decline rejected in the final-settlement path', () => {
    const payments = fs.readFileSync(path.join(process.cwd(), 'src/lib/payments/index.ts'), 'utf8');
    expect(payments).toContain('validation.finalDecline');
    expect(payments).toContain('rejectOnlineTopup');
    expect(payments).toContain('classifyPaymentRejection');
  });

  it('returns a dedicated public final-result URL to ARB instead of looping back into the acknowledgement endpoint', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/pay/callback/[provider]/route.ts'), 'utf8');
    expect(source).toContain("new URL(`/api/pay/final/${provider}`, `https://${SITE.domain}`)");
    expect(source).toContain("resultUrl.searchParams.set('t', String(topupId));");
  });

  it('redirects the payment result page to the public Trbhh domain', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/pay/callback/[provider]/route.ts'), 'utf8');
    expect(source).toContain("new URL('/payment/result', `https://${SITE.domain}`)");
  });

  it('returns a JSON acknowledgement to the bank and lets the distinct final endpoint redirect the browser', () => {
    const callback = fs.readFileSync(path.join(process.cwd(), 'src/app/api/pay/callback/[provider]/route.ts'), 'utf8');
    const finalRoute = fs.readFileSync(path.join(process.cwd(), 'src/app/api/pay/final/[provider]/route.ts'), 'utf8');
    expect(callback).toContain("return NextResponse.json([{ status: '1'");
    expect(finalRoute).toContain("new URL('/payment/result', `https://${SITE.domain}`)");
  });

  it('has a separate final-result endpoint which settles or rejects the encrypted bank result automatically', () => {
    const finalRoute = path.join(process.cwd(), 'src/app/api/pay/final/[provider]/route.ts');
    expect(fs.existsSync(finalRoute)).toBe(true);
    const source = fs.readFileSync(finalRoute, 'utf8');
    expect(source).toContain('resolveAlrajhiFinalResult');
    expect(source).toContain("new URL('/payment/result', `https://${SITE.domain}`)");
  });
});
