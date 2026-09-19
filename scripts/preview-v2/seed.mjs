/** Standalone isolated seed, adapted from scripts/preview/seed.mjs.
 * Node 24+. Requires DATABASE_URL and PREVIEW_LOGIN_PASSWORD.
 * Creates only synthetic accounts/settings/regions, never synthetic ads.
 * Run once after creating the empty schema; never runs at module import.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const DATABASE = 'trbhh_preview_v2';
export const MARKER = 'preview_v2_seed';
export const VERSION = '2026-09-19-v1';
export class PreviewGuardError extends Error {}
export function guard(ok, message) { if (!ok) throw new PreviewGuardError(message); }
export function guardDatabaseUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new PreviewGuardError('Invalid sandbox database URL.'); }
  guard(url.protocol === 'mysql:' && ['localhost', '127.0.0.1', '[::1]', 'preview-db'].includes(url.hostname)
    && url.pathname === `/${DATABASE}` && !url.hash
    && [...url.searchParams.keys()].every(key => ['connection_limit', 'pool_timeout', 'connect_timeout'].includes(key)), 'Database is not the isolated V2 sandbox.');
  return raw;
}
export async function checkDatabase(db, requireMarker = true) {
  const actual = await db.$queryRaw`SELECT DATABASE() AS name`;
  guard(actual[0]?.name === DATABASE, 'Connected database is not the V2 sandbox.');
  const marker = await db.site_settings.findUnique({ where: { k: MARKER } });
  if (requireMarker) guard(marker?.v === VERSION, 'Expected V2 seed marker is missing.');
  return marker;
}
export function reportFailure(error) {
  console.error(error instanceof PreviewGuardError ? error.message : 'Sandbox operation failed; no credentials or source data logged.');
  process.exitCode = 1;
}

export async function seed(env = process.env) {
  const url = guardDatabaseUrl(env.DATABASE_URL);
  const password = env.PREVIEW_LOGIN_PASSWORD || '';
  guard([...password].length >= 12 && Buffer.byteLength(password) <= 72
    && !/^\p{N}+$/u.test(password) && !/^(.)\1+$/u.test(password)
    && !/^(password|qwerty|123456|كلمة المرور)+[\d!@#$]*$/i.test(password), 'Supply a strong sandbox-only password (12 characters minimum, 72 UTF-8 bytes maximum).');
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  try {
    const marker = await checkDatabase(db, false);
    if (marker) {
      guard(marker.v === VERSION, 'Unexpected seed version; refusing changes.');
      console.info('[preview-v2-seed] Already seeded; no changes.');
      return;
    }
    const tables = await db.$queryRaw`SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ${DATABASE} AND TABLE_TYPE = 'BASE TABLE'`;
    for (const { name } of tables) {
      if (name === '_prisma_migrations') continue;
      guard(/^[a-zA-Z0-9_]+$/.test(name), 'Unexpected table identifier.');
      const rows = await db.$queryRawUnsafe(`SELECT 1 AS present FROM \`${name}\` LIMIT 1`);
      guard(rows.length === 0, 'Sandbox must be empty before the initial seed.');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const regions = ['الرياض', 'مكة المكرمة', 'المدينة المنورة', 'القصيم', 'المنطقة الشرقية', 'عسير', 'تبوك', 'حائل', 'الحدود الشمالية', 'جازان', 'نجران', 'الباحة', 'الجوف'];
    await db.$transaction(async tx => {
      await tx.site_settings.createMany({ data: Object.entries({
        [MARKER]: VERSION,
        site_share_title: 'تربح — بيئة اختبار مستقلة',
        site_share_desc: 'إعلانات عامة من لقطة مؤرخة، وحسابات وتعديلات اختبار معزولة؛ لا اتصال بقاعدة الإنتاج.',
        home_discovery_on: '1', search_price_filter_on: '1', ad_mobile_contact_on: '0',
        home_discovery_title: 'تربح — معاينة مستقلة',
        home_discovery_subtitle: 'لقطة إعلانات عامة للاختبار؛ الحسابات والتعديلات هنا مستقلة عن الموقع الأصلي.',
        ticker_note: 'بيئة اختبار مستقلة — لا دفع ولا نشر على الموقع الأصلي.',
        v2_design_on: '0', otp_enabled: '0', sms_username: '', sms_password: '', sms_sender: '', wa_instance: '', wa_token: '',
        auth_require_admin_mfa: '0', auth_password_min: '12',
        push_on: '0', vapid_public: '', vapid_private: '', pay_online_on: '0',
        payment_electronic_enabled: '0', payment_transfer_enabled: '0', pay_provider: '', pay_mode: 'test', pay_methods: '[]',
        platform_ad_lifecycle_enabled: '0', platform_ad_sms_enabled: '0', archive_autodelete_on: '0',
        autorenew_on: '0', sub_remind_days: '0', sub_remind_count: '0', lead_on: '0', plus_on: '0', topup_accounts: '[]',
      }).map(([k, v]) => ({ k, v })) });
      await tx.settings.create({ data: { name: 'تربح — اختبار مستقل', logo: 0, default_image: 0, active_register: 0, description: 'بيئة اختبار مستقلة', login_message: 'استخدم حساب الاختبار فقط.' } });
      await tx.countries.create({ data: { id: 1, name: 'المملكة العربية السعودية', key: '966', send_sms: 0 } });
      await tx.cities.createMany({ data: regions.map((name, i) => ({ id: BigInt(i + 1), name, country_id: 1, ordered: i + 1 })) });
      await tx.users.createMany({ data: [
        { id: 1001n, userName: 'preview', name: 'عضو الاختبار' },
        { id: 1002n, userName: 'preview-store', name: 'تاجر الاختبار' },
      ].map(user => ({ ...user, password: passwordHash, type: 'user', is_admin: 0, trusted: 0,
        country_id: 1, city_id: 1n, auth_session_version: randomUUID(), allow_phone: 0, whatsapp: 0,
        phoneNumber: null, phone_whatsapp: null, email: null, balance: 0, balance_halala: 0 })) });
      await tx.profiles.createMany({ data: [1001n, 1002n].map(id => ({ id, user_id: id, name: id === 1001n ? 'عضو الاختبار' : 'تاجر الاختبار', type: 'personal', is_default: 1, status: 1 })) });
    }, { timeout: 60000 });
    console.info('[preview-v2-seed] Created two synthetic accounts and safe settings; no ads or contacts.');
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) seed().catch(reportFailure);
