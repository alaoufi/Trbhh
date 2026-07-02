import 'server-only';
import { spawn } from 'node:child_process';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

/* Where backups live — inside the persistent storage volume so they survive
   redeploys. */
export function backupsDir(): string {
  const base = process.env.STORAGE_DIR || '/app/storage';
  return path.join(base, 'backups');
}

/** Only allow simple, safe backup file names (no path traversal). */
export function isValidBackupName(name: string): boolean {
  return /^[A-Za-z0-9_\-]+\.sql$/.test(name);
}

export function backupFilePath(name: string): string {
  if (!isValidBackupName(name)) throw new Error('اسم ملف غير صالح');
  const file = path.join(backupsDir(), name);
  // ensure the resolved path stays inside the backups dir
  if (path.dirname(file) !== backupsDir()) throw new Error('مسار غير صالح');
  return file;
}

type DbConn = { host: string; port: string; user: string; password: string; database: string };

function parseDbUrl(): DbConn {
  const raw = process.env.DATABASE_URL || '';
  if (!raw) throw new Error('DATABASE_URL غير مضبوط');
  const u = new URL(raw);
  return {
    host: u.hostname,
    port: u.port || '3306',
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '') || '',
  };
}

function stamp(): string {
  // 2026-07-02_23-30-05
  return new Date().toISOString().replace('T', '_').replace(/\..+$/, '').replace(/:/g, '-');
}

/** Run a mysql-family binary, returning a promise that rejects on non-zero exit. */
function run(
  bin: string,
  args: string[],
  conn: DbConn,
  io: { stdout?: NodeJS.WritableStream; stdin?: NodeJS.ReadableStream },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: { ...process.env, MYSQL_PWD: conn.password } });
    let err = '';
    child.stderr.on('data', (d) => { err += String(d); });
    child.on('error', (e: NodeJS.ErrnoException) => {
      reject(new Error(e.code === 'ENOENT' ? `الأداة ${bin} غير مثبّتة في الحاوية` : e.message));
    });
    if (io.stdout) child.stdout.pipe(io.stdout);
    if (io.stdin) io.stdin.pipe(child.stdin);
    child.on('close', (code) => {
      // mysqldump prints harmless warnings to stderr but still exits 0
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `فشل التنفيذ (رمز ${code})`));
    });
  });
}

/** Create a full logical backup. Returns the created file name. */
export async function createBackup(prefix = 'backup'): Promise<string> {
  const conn = parseDbUrl();
  const dir = backupsDir();
  await mkdir(dir, { recursive: true });
  const safePrefix = /^[A-Za-z0-9_\-]+$/.test(prefix) ? prefix : 'backup';
  const name = `${safePrefix}_${stamp()}.sql`;
  const file = path.join(dir, name);
  const out = createWriteStream(file);
  try {
    await run(
      'mysqldump',
      [
        '-h', conn.host, '-P', conn.port, '-u', conn.user,
        '--single-transaction', '--quick', '--no-tablespaces',
        '--default-character-set=utf8mb4', conn.database,
      ],
      conn,
      { stdout: out },
    );
  } catch (e) {
    await unlink(file).catch(() => {});
    throw e;
  }
  return name;
}

export type BackupInfo = { name: string; sizeMB: number; mtime: number };

export async function listBackups(): Promise<BackupInfo[]> {
  const dir = backupsDir();
  const names = await readdir(dir).catch(() => [] as string[]);
  const out: BackupInfo[] = [];
  for (const name of names) {
    if (!isValidBackupName(name)) continue;
    const s = await stat(path.join(dir, name)).catch(() => null);
    if (!s) continue;
    out.push({ name, sizeMB: Math.round((s.size / 1048576) * 10) / 10, mtime: s.mtimeMs });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

export async function deleteBackup(name: string): Promise<void> {
  await unlink(backupFilePath(name));
}

/**
 * Restore the database from a backup file. DESTRUCTIVE — replaces current data.
 * A safety snapshot of the current state is taken first (pre-restore_*.sql).
 */
export async function restoreBackup(name: string): Promise<{ safety: string }> {
  const file = backupFilePath(name);
  const s = await stat(file).catch(() => null);
  if (!s) throw new Error('الملف غير موجود');

  // 1) safety snapshot of the CURRENT database so the restore is reversible
  const safety = await createBackup('pre-restore');

  // 2) apply the chosen backup
  const conn = parseDbUrl();
  const input = createReadStream(file);
  await run(
    'mysql',
    ['-h', conn.host, '-P', conn.port, '-u', conn.user, '--default-character-set=utf8mb4', conn.database],
    conn,
    { stdin: input },
  );
  return { safety };
}
