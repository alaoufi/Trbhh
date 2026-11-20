import 'server-only';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { connect } from 'node:http2';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';

/**
 * إشعارات تطبيق iPhone عبر Apple (APNs) — تصل والتطبيق مغلق.
 * المفتاح يُقرأ من البيئة فقط (`/etc/trbhh/app.env` على الخادم، يكتبه deploy/edge-server/apns-setup.sh)
 * ولا يُحفظ في القاعدة ولا في Git. التفعيل نفسه بمفتاح «التنبيهات الفورية» في لوحة الإدارة (push_on).
 */

export type ApnsConfig = { keyId: string; teamId: string; bundleId: string; key: KeyObject };
export type ApnsPayload = { title: string; body: string; url?: string };
export type ApnsResult = { status: number; reason: string };

/** رمز الجهاز من Apple: حروف ست عشرية (64 حالياً، وApple تحتفظ بحق تطويله). */
export function isApnsToken(token: unknown): token is string {
  return typeof token === 'string' && /^[0-9a-f]{64,200}$/.test(token);
}

/** يقبل نص ملف ‎.p8 كما هو، أو بأسطر مهرّبة ‎\n، أو مرمّزاً Base64 (أسلم داخل ملف بيئة من سطر واحد). */
export function parseApnsKey(raw: string): KeyObject | null {
  let pem = (raw || '').trim();
  if (!pem) return null;
  if (!pem.includes('BEGIN')) {
    try { pem = Buffer.from(pem, 'base64').toString('utf8').trim(); } catch { return null; }
  }
  pem = pem.replace(/\\n/g, '\n');
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return null;
    return key;
  } catch { return null; }
}

let cachedConfig: { src: string; cfg: ApnsConfig | null } | null = null;

export function apnsConfig(env: NodeJS.ProcessEnv = process.env): ApnsConfig | null {
  const keyId = (env.APNS_KEY_ID || '').trim();
  const teamId = (env.APNS_TEAM_ID || '').trim();
  const bundleId = (env.APNS_BUNDLE_ID || '').trim();
  const raw = env.APNS_KEY || '';
  const src = `${keyId}|${teamId}|${bundleId}|${raw.length}`;
  if (env === process.env && cachedConfig?.src === src) return cachedConfig.cfg;
  let cfg: ApnsConfig | null = null;
  if (/^[A-Z0-9]{10}$/.test(keyId) && /^[A-Z0-9]{10}$/.test(teamId) && /^[A-Za-z0-9.-]{3,155}$/.test(bundleId)) {
    const key = parseApnsKey(raw);
    if (key) cfg = { keyId, teamId, bundleId, key };
  }
  if (env === process.env) cachedConfig = { src, cfg };
  return cfg;
}

export function apnsConfigured(): boolean {
  return apnsConfig() !== null;
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString('base64url');

/** رمز الدخول لـApple (JWT ES256). Apple ترفض الرمز الأقدم من ساعة وتحظر تجديده أكثر من مرة كل 20 دقيقة. */
export function apnsJwt(cfg: ApnsConfig, nowSec: number): string {
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: nowSec }));
  const sig = sign('sha256', Buffer.from(`${head}.${claims}`), { key: cfg.key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${claims}.${b64url(sig)}`;
}

let cachedJwt: { kid: string; at: number; token: string } | null = null;
function bearer(cfg: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.kid === cfg.keyId && now - cachedJwt.at < 40 * 60) return cachedJwt.token;
  cachedJwt = { kid: cfg.keyId, at: now, token: apnsJwt(cfg, now) };
  return cachedJwt.token;
}

export function apnsBody(payload: ApnsPayload): string {
  return JSON.stringify({
    aps: { alert: { title: payload.title.slice(0, 80), body: payload.body.slice(0, 160) }, sound: 'default' },
    url: payload.url || '/',
  });
}

/** يرسل إشعاراً واحداً. لا يرمي: فشل الشبكة يعود كـ status=0. */
export function apnsSend(cfg: ApnsConfig, token: string, payload: ApnsPayload, sandbox: boolean): Promise<ApnsResult> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: ApnsResult) => { if (!done) { done = true; resolve(r); try { client.close(); } catch { /* مغلق */ } } };
    const client = connect(sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');
    const timer = setTimeout(() => { finish({ status: 0, reason: 'timeout' }); try { client.destroy(); } catch { /* مغلق */ } }, 10_000);
    client.on('error', () => { clearTimeout(timer); finish({ status: 0, reason: 'network' }); });
    const body = apnsBody(payload);
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${bearer(cfg)}`,
      'apns-topic': cfg.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    });
    let status = 0, text = '';
    req.setEncoding('utf8');
    req.on('response', (h) => { status = Number(h[':status']) || 0; });
    req.on('data', (c: string) => { if (text.length < 2000) text += c; });
    req.on('end', () => {
      clearTimeout(timer);
      let reason = '';
      try { reason = String((JSON.parse(text || '{}') as { reason?: string }).reason || ''); } catch { /* بلا متن */ }
      finish({ status, reason: reason.slice(0, 60) });
    });
    req.on('error', () => { clearTimeout(timer); finish({ status: 0, reason: 'network' }); });
    req.end(body);
  });
}

/** Apple تقول إن الرمز لم يعد صالحاً (حُذف التطبيق أو تغيّر الرمز): يُحذف من عندنا. */
export function isDeadApnsToken(r: ApnsResult): boolean {
  return r.status === 410 || (r.status === 400 && (r.reason === 'BadDeviceToken' || r.reason === 'DeviceTokenNotForTopic'));
}

/** يربط الجهاز بالعضو الحالي. الجهاز الواحد لعضو واحد: آخر من سجّل الدخول عليه. */
export async function saveApnsDevice(userId: number, token: string, sandbox: boolean): Promise<boolean> {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !isApnsToken(token)) return false;
  await ensureSchema();
  await prisma.$executeRaw`INSERT INTO apns_devices (user_id, token, sandbox) VALUES (${userId}, ${token}, ${sandbox ? 1 : 0})
    ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), sandbox = VALUES(sandbox), updated_at = CURRENT_TIMESTAMP`;
  return true;
}

/** يفصل الجهاز عن أي عضو (عند الخروج أو إيقاف التنبيهات) فلا تصل إشعارات حساب لمن خرج منه. */
export async function deleteApnsDevice(token: string): Promise<void> {
  if (!isApnsToken(token)) return;
  await ensureSchema();
  await prisma.$executeRaw`DELETE FROM apns_devices WHERE token = ${token}`;
}

export async function hasApnsDevice(userId: number, token?: string): Promise<boolean> {
  await ensureSchema();
  const rows = token && isApnsToken(token)
    ? await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM apns_devices WHERE user_id = ${userId} AND token = ${token}`.catch(() => [])
    : await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM apns_devices WHERE user_id = ${userId}`.catch(() => []);
  return Number(rows[0]?.n || 0) > 0;
}

/** يرسل لكل أجهزة iPhone المسجلة للعضو، وينظّف الرموز الميتة. لا يرمي. */
export async function sendApnsToUser(userId: number, payload: ApnsPayload): Promise<{ devices: number; sent: number; failed: number; error?: string }> {
  const cfg = apnsConfig();
  if (!cfg) return { devices: 0, sent: 0, failed: 0 };
  try {
    await ensureSchema();
    const rows = await prisma.$queryRaw<{ id: bigint; token: string; sandbox: number }[]>`SELECT id, token, sandbox FROM apns_devices WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 8`;
    let sent = 0, failed = 0, error = '';
    await Promise.all(rows.map(async (d) => {
      const r = await apnsSend(cfg, d.token, payload, Number(d.sandbox) === 1);
      if (r.status === 200) { sent += 1; return; }
      failed += 1;
      error = r.reason || `HTTP ${r.status}`;
      if (isDeadApnsToken(r)) await prisma.$executeRaw`DELETE FROM apns_devices WHERE id = ${d.id}`.catch(() => {});
    }));
    return { devices: rows.length, sent, failed, ...(error ? { error } : {}) };
  } catch {
    return { devices: 0, sent: 0, failed: 0, error: 'apns_unavailable' };
  }
}
