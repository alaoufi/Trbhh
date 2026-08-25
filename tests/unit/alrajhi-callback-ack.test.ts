import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Al Rajhi callback acknowledgement', () => {
  it('settles a legacy browser callback rather than rendering an acknowledgement JSON', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/pay/callback/[provider]/route.ts'), 'utf8');
    expect(source).toContain("provider === 'alrajhi_arb'");
    expect(source).toContain('resolveAlrajhiFinalResult');
    expect(source).toContain('return NextResponse.redirect(resultUrl, { status: 303 });');
    expect(source).not.toContain("return NextResponse.json([{ status: '1'");
  });

  it('reads the ARB POST body once before settling the final response', () => {
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
    expect(payments).toContain(".filter(Boolean).join(' ')");
  });

  it('uses the public final-result endpoint as ARB responseURL so a browser never renders an acknowledgement JSON', () => {
    const payments = fs.readFileSync(path.join(process.cwd(), 'src/lib/payments/index.ts'), 'utf8');
    expect(payments).toContain("cfg.provider === 'alrajhi_arb'");
    expect(payments).toContain('`${baseUrl()}/api/pay/final/${cfg.provider}?t=${topupId}`');
  });

  it('redirects the payment result page to the public Trbhh domain', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/pay/callback/[provider]/route.ts'), 'utf8');
    expect(source).toContain("new URL('/payment/result', `https://${SITE.domain}`)");
  });

  it('settles the browser final response and redirects it to the member result page', () => {
    const finalRoute = fs.readFileSync(path.join(process.cwd(), 'src/app/api/pay/final/[provider]/route.ts'), 'utf8');
    expect(finalRoute).toContain('await resolveAlrajhiFinalResult(topupId, body);');
    expect(finalRoute).toContain('return resultRedirect(topupId);');
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
