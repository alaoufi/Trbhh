import 'server-only';

/**
 * إعداد تكامل CJdropshipping — كل القيم من متغيّرات البيئة فقط (لا أسرار في الكود
 * أو المستودع). التكامل «أساس جاهز» للاختبار الداخلي فقط؛ لا شراء حقيقي في الإنتاج
 * إلا بعد تفعيل «الشراء» يدوياً من لوحة الإدارة (commerce_purchasing_enabled).
 * مرجع الـAPI: https://developers.cjdropshipping.com/en/api/introduction.html
 */
export type CjConfig = {
  base: string;
  email: string;
  apiKey: string;
  webhookSecret: string;
  encryptionKey: string;
  configured: boolean;
};

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

export function cjConfig(): CjConfig {
  const base = trimSlash(process.env.CJ_API_BASE || 'https://developers.cjdropshipping.com/api2.0/v1');
  const email = (process.env.CJ_API_EMAIL || '').trim();
  const apiKey = (process.env.CJ_API_KEY || '').trim();
  const webhookSecret = (process.env.CJ_WEBHOOK_SECRET || '').trim();
  // مفتاح التشفير مشترك مع طبقة الموردين (AES-256-GCM) — ٦٤ خانة hex.
  const encryptionKey = (process.env.SUPPLIER_TOKEN_ENCRYPTION_KEY || '').trim();
  return {
    base,
    email,
    apiKey,
    webhookSecret,
    encryptionKey,
    configured: !!(email && apiKey && /^[a-fA-F0-9]{64}$/.test(encryptionKey)),
  };
}
