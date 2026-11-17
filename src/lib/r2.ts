import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';

/**
 * تخزين الوسائط على Cloudflare R2 (واجهة S3). يُفعَّل بوجود متغيّرات R2_* الأربعة؛ بدونها
 * يبقى التخزين على القرص كما كان (التطوير والاختبارات والخادم القديم).
 * المخزن خاص: لا رابط عام. الخادم وحده يقرأ ويكتب بطلبات موقّعة (SigV4)، والزائر يصل
 * للملف عبر مسار /media فتبقى صلاحيات المستندات الخاصة كما هي.
 * الاتصال عبر IPv4 حصراً لأن مفتاح R2 مقيّد بعنوان الخادم IPv4.
 */
export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

export function r2Config(env: NodeJS.ProcessEnv = process.env): R2Config | null {
  const accountId = (env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = (env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = (env.R2_MEDIA_BUCKET || '').trim();
  return accountId && accessKeyId && secretAccessKey && bucket ? { accountId, accessKeyId, secretAccessKey, bucket } : null;
}
export const r2Enabled = (): boolean => r2Config() !== null;

const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data, 'utf8').digest();
const sha256Hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** ترميز مسار وفق RFC 3986 مقطعاً مقطعاً (الشرطة المائلة تبقى فاصلاً). */
export function encodeKeyPath(key: string): string {
  return key.split('/').map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
}

/** توقيع AWS SigV4 عام. الترويسات تُمرَّر بأسماء صغيرة؛ يعيد قيمة ترويسة Authorization. */
export function sigV4(input: {
  method: string; path: string; query?: string; headers: Record<string, string>; payloadHash: string;
  region: string; service: string; accessKeyId: string; secretAccessKey: string; amzDate: string;
}): string {
  const names = Object.keys(input.headers).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = names.map((h) => `${h}:${String(input.headers[h]).trim().replace(/\s+/g, ' ')}\n`).join('');
  const signedHeaders = names.join(';');
  const canonical = [input.method, input.path, input.query || '', canonicalHeaders, signedHeaders, input.payloadHash].join('\n');
  const date = input.amzDate.slice(0, 8);
  const scope = `${date}/${input.region}/${input.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', input.amzDate, scope, sha256Hex(canonical)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac('AWS4' + input.secretAccessKey, date), input.region), input.service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(toSign, 'utf8').digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

const agent = new https.Agent({ keepAlive: true, maxSockets: 64, family: 4 });
const PAYLOAD = 'UNSIGNED-PAYLOAD';

function request(method: 'GET' | 'PUT' | 'HEAD', key: string, opts: { body?: Buffer; range?: string | null; contentType?: string } = {}): Promise<IncomingMessage> {
  const cfg = r2Config();
  if (!cfg) return Promise.reject(new Error('R2 غير مهيأ'));
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const path = `/${cfg.bucket}/${encodeKeyPath(key)}`;
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const signed: Record<string, string> = { host, 'x-amz-content-sha256': PAYLOAD, 'x-amz-date': amzDate };
  const authorization = sigV4({ method, path, headers: signed, payloadHash: PAYLOAD, region: 'auto', service: 's3', accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, amzDate });
  const headers: Record<string, string | number> = { ...signed, authorization };
  if (opts.range) headers.range = opts.range;
  if (opts.body) { headers['content-length'] = opts.body.length; headers['content-type'] = opts.contentType || 'application/octet-stream'; }
  return new Promise((resolve, reject) => {
    const req = https.request({ host, path, method, headers, agent, family: 4, timeout: 30_000 }, resolve);
    req.on('timeout', () => req.destroy(new Error('انتهت مهلة الاتصال بـR2')));
    req.on('error', reject);
    req.end(opts.body);
  });
}

async function drain(res: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of res) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** رفع ملف. يرمي خطأ إن لم يؤكد R2 الحفظ — لا نُسجّل مساراً لملف لم يُحفظ. */
export async function r2Put(key: string, body: Buffer, contentType?: string): Promise<void> {
  const res = await request('PUT', key, { body, contentType });
  const text = (await drain(res)).toString('utf8').slice(0, 200);
  if (res.statusCode !== 200) throw new Error(`فشل الرفع إلى R2 (${res.statusCode}) ${text.replace(/\s+/g, ' ')}`);
}

/** فتح ملف للبث (يدعم Range). المستدعي يستهلك الجسم أو يتلفه. */
export async function r2Open(key: string, range?: string | null): Promise<{ status: number; headers: IncomingMessage['headers']; body: IncomingMessage }> {
  const res = await request('GET', key, { range });
  return { status: res.statusCode || 0, headers: res.headers, body: res };
}

/** قراءة ملف كاملاً في الذاكرة (للإيصالات والصور الصغيرة). null إن غاب. */
export async function r2Read(key: string, maxBytes = 64 * 1024 * 1024): Promise<Buffer | null> {
  const res = await request('GET', key);
  if (res.statusCode !== 200 || Number(res.headers['content-length'] || 0) > maxBytes) { res.destroy(); return null; }
  return drain(res);
}
