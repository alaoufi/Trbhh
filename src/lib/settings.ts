import 'server-only';
import { prisma } from './prisma';

let ensured = false;
async function ensure() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS site_settings (
      k VARCHAR(60) NOT NULL PRIMARY KEY,
      v VARCHAR(255) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

export async function getSetting(k: string, fallback = ''): Promise<string> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ v: string | null }[]>(`SELECT v FROM site_settings WHERE k = ?`, k).catch(() => []);
  return rows[0]?.v ?? fallback;
}

export async function getSettingNum(k: string, fallback = 0): Promise<number> {
  const v = await getSetting(k, String(fallback));
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function setSetting(k: string, v: string) {
  await ensure();
  await prisma.$executeRawUnsafe(
    `INSERT INTO site_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)`, k, v,
  );
}

export async function getSettingBool(k: string, fallback = true): Promise<boolean> {
  const v = await getSetting(k, fallback ? '1' : '0');
  return v !== '0' && v !== '' && v.toLowerCase() !== 'false';
}

/* Member self-service windows (hours). 0 = unlimited (always allowed). */
export const SETTING_AD_EDIT_HOURS = 'ad_edit_hours';
export const SETTING_AD_DELETE_HOURS = 'ad_delete_hours';

/* Toggle the stats row on the home page (1/0). */
export const SETTING_SHOW_STATS = 'show_home_stats';

export type MemberWindows = { editHours: number; deleteHours: number };
export async function getMemberWindows(): Promise<MemberWindows> {
  const [editHours, deleteHours] = await Promise.all([
    getSettingNum(SETTING_AD_EDIT_HOURS, 0),
    getSettingNum(SETTING_AD_DELETE_HOURS, 0),
  ]);
  return { editHours, deleteHours };
}

/** Hours elapsed since a timestamp (Infinity when unknown → treat as outside any window). */
export function hoursSince(dt: Date | string | null | undefined): number {
  if (!dt) return Infinity;
  const t = new Date(dt).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 3600000;
}

/** Whether a member may still edit/delete their item given the configured window. */
export function withinWindow(createdAt: Date | string | null | undefined, windowHours: number): boolean {
  if (!windowHours || windowHours <= 0) return true; // unlimited
  return hoursSince(createdAt) <= windowHours;
}
