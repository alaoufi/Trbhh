import 'server-only';
import { r2BackupConfig, r2List, r2Read } from './r2';
import { getSetting, setSetting } from './settings';

/**
 * النسخ الاحتياطية الكاملة المشفّرة في مخزن R2 (trbhh-backups): يأخذها سكربت الخادم يومياً
 * (deploy/edge-server/backup.sh) وعند الطلب من لوحة الإدارة. التطبيق لا يملك صلاحيات الخادم،
 * فهو يعرض النسخ وينزّلها ويسجّل «طلب نسخة الآن» فقط، ومراقب على الخادم ينفّذ الطلب.
 */
export type CloudBackupManifest = {
  kind?: string; createdAt?: string; commit?: string; tables?: number; databaseBytes?: number;
  codeBundleBytes?: number; secretsFiles?: number; contents?: string[];
};
export type CloudBackup = { key: string; name: string; kind: 'daily' | 'manual'; size: number; lastModified: string; manifest: CloudBackupManifest | null };
export type CloudBackupStatus = { requestedAt: string; requestedBy: string; lastAt: string; lastStatus: string; lastName: string; pending: boolean };

const BACKUP_NAME = /^(daily|manual)\/trbhh-[0-9TZ:-]+\.tar\.gpg$/;
export const isCloudBackupKey = (key: string): boolean => BACKUP_NAME.test(key);
export const cloudBackupsEnabled = (): boolean => r2BackupConfig() !== null;

export async function listCloudBackups(limit = 40): Promise<CloudBackup[]> {
  const cfg = r2BackupConfig();
  if (!cfg) return [];
  const objects = [...(await r2List('daily/', cfg)), ...(await r2List('manual/', cfg))];
  const sizes = new Map(objects.map((o) => [o.key, o]));
  const backups = objects.filter((o) => isCloudBackupKey(o.key))
    .sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1)).slice(0, limit);
  return Promise.all(backups.map(async (o) => {
    const manifestKey = o.key.replace(/\.tar\.gpg$/, '.json');
    let manifest: CloudBackupManifest | null = null;
    if (sizes.has(manifestKey)) {
      const buf = await r2Read(manifestKey, 64 * 1024, cfg).catch(() => null);
      try { manifest = buf ? JSON.parse(buf.toString('utf8')) as CloudBackupManifest : null; } catch { manifest = null; }
    }
    return { key: o.key, name: o.key.split('/').pop() || o.key, kind: o.key.startsWith('manual/') ? 'manual' as const : 'daily' as const, size: o.size, lastModified: o.lastModified, manifest };
  }));
}

export async function cloudBackupStatus(): Promise<CloudBackupStatus> {
  const [requestedAt, requestedBy, lastAt, lastStatus, lastName] = await Promise.all([
    getSetting('backup_request_at', ''), getSetting('backup_request_by', ''),
    getSetting('backup_last_at', ''), getSetting('backup_last_status', ''), getSetting('backup_last_name', ''),
  ]);
  return { requestedAt, requestedBy, lastAt, lastStatus, lastName, pending: !!requestedAt && (!lastAt || requestedAt > lastAt) };
}

/** يسجّل طلب «نسخة الآن». المراقب على الخادم ينفّذه خلال دقيقة تقريباً. طلب واحد معلّق يكفي. */
export async function requestCloudBackup(actorId: number): Promise<'requested' | 'already-pending'> {
  if ((await cloudBackupStatus()).pending) return 'already-pending';
  await setSetting('backup_request_by', String(actorId));
  await setSetting('backup_request_at', new Date().toISOString());
  return 'requested';
}
