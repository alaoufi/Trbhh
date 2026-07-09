import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { getSetting, getSettingBool, setSetting } from './settings';

const ensure = ensureSchema;

/** مفتاح تفعيل التنبيهات الفورية — من لوحة التحكم ← الإعدادات. */
export const SETTING_PUSH_ON = 'push_on';

export async function pushEnabled(): Promise<boolean> {
  return getSettingBool(SETTING_PUSH_ON, false);
}

/** مفاتيح VAPID تُولَّد مرة واحدة وتُحفظ في الإعدادات — لا حاجة لمتغيرات بيئة. */
async function getVapid(): Promise<{ publicKey: string; privateKey: string }> {
  const [pub, priv] = await Promise.all([getSetting('vapid_public', ''), getSetting('vapid_private', '')]);
  if (pub && priv) return { publicKey: pub, privateKey: priv };
  const webpush = (await import('web-push')).default;
  const keys = webpush.generateVAPIDKeys();
  await setSetting('vapid_public', keys.publicKey);
  await setSetting('vapid_private', keys.privateKey);
  return keys;
}

export async function getPushPublicKey(): Promise<string> {
  return (await getVapid()).publicKey;
}

/** حفظ اشتراك جهاز (مرة لكل endpoint). */
export async function savePushSub(userId: number, sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  await ensure();
  const endpoint = String(sub.endpoint || '').slice(0, 500);
  if (!endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return;
  await prisma.push_subs.deleteMany({ where: { endpoint } }).catch(() => {});
  await prisma.push_subs.create({
    data: { user_id: BigInt(userId), endpoint, p256dh: String(sub.keys.p256dh).slice(0, 255), auth: String(sub.keys.auth).slice(0, 120) },
  }).catch(() => {});
}

export async function deletePushSub(endpoint: string): Promise<void> {
  await ensure();
  if (!endpoint) return;
  await prisma.push_subs.deleteMany({ where: { endpoint: endpoint.slice(0, 500) } }).catch(() => {});
}

export async function hasPushSub(userId: number): Promise<boolean> {
  await ensure();
  const n = await prisma.push_subs.count({ where: { user_id: BigInt(userId) } }).catch(() => 0);
  return n > 0;
}

/** إرسال تنبيه فوري لكل أجهزة عضو — يتجاهل بصمت عند التعطيل أو غياب الاشتراكات. */
export async function sendPushToUser(userId: number, payload: { title: string; body: string; url?: string }): Promise<void> {
  try {
    if (!(await pushEnabled())) return;
    await ensure();
    const subs = await prisma.push_subs.findMany({ where: { user_id: BigInt(userId) }, take: 8 }).catch(() => []);
    if (!subs.length) return;
    const webpush = (await import('web-push')).default;
    const { publicKey, privateKey } = await getVapid();
    webpush.setVapidDetails('mailto:admin@trbhh.com', publicKey, privateKey);
    const data = JSON.stringify({ title: payload.title.slice(0, 80), body: payload.body.slice(0, 160), url: payload.url || '/' });
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data, { TTL: 86400 });
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) await prisma.push_subs.delete({ where: { id: s.id } }).catch(() => {}); // اشتراك ميّت
      }
    }));
  } catch { /* لا يُفشل التنبيه أي عملية أساسية */ }
}
