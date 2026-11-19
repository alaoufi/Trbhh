import { AccessPage } from '@/components/access-boundary';
import { AccessBoundary } from '@/components/access-boundary';
import { requireAdminPage } from '@/lib/access-control/guards';
import { DatabaseBackup, Download, Trash2, AlertTriangle, ShieldAlert, Check, HardDriveDownload, RotateCcw, CloudUpload, Lock, Clock } from 'lucide-react';
import { hasAction } from '@/lib/roles';
import { listBackups } from '@/lib/backup';
import { cloudBackupsEnabled, cloudBackupStatus, listCloudBackups, type CloudBackup } from '@/lib/cloud-backup';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { createBackupAction, deleteBackupAction, restoreBackupAction, requestCloudBackupAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'النسخ الاحتياطي والاستعادة' };

function fmtDate(ms: number): string {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

function fmtIso(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? fmtDate(ms) : '—';
}

function fmtSize(bytes: number): string {
  if (!bytes) return '—';
  return bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(2)} غيغابايت` : `${(bytes / 1048576).toFixed(1)} ميغابايت`;
}

/** تعريف مقروء بما تحويه النسخة، من ملف الوصف المرفوع معها. */
function describeBackup(b: CloudBackup): string[] {
  const m = b.manifest;
  const lines = [b.kind === 'manual' ? 'نسخة يدوية (طُلبت من لوحة الإدارة)' : 'نسخة يومية تلقائية'];
  if (!m) { lines.push('نسخة كاملة مشفّرة: قاعدة البيانات والكود والأسرار.'); return lines; }
  if (m.tables) lines.push(`قاعدة البيانات كاملة مع توصيفها: ${m.tables} جدولاً${m.databaseBytes ? ` (${fmtSize(m.databaseBytes)} مضغوطة)` : ''}`);
  if (m.commit) lines.push(`الكود كاملاً بكل تاريخه — النسخة ${m.commit.slice(0, 7)}${m.codeBundleBytes ? ` (${fmtSize(m.codeBundleBytes)})` : ''}`);
  if (m.secretsFiles) lines.push(`إعدادات وأسرار الخادم: ${m.secretsFiles} ملفاً (عدا مفتاح التشفير نفسه)`);
  return lines;
}

export default async function BackupPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string; name?: string; safety?: string }> }) {
  const session = await requireAdminPage('/admin/backup');
  const cloudOn = cloudBackupsEnabled();
  const [{ done, error, name, safety }, backups, cloud, cloudStatus, canAdd, canRestore, canDelete] = await Promise.all([
    searchParams,
    listBackups(),
    cloudOn ? listCloudBackups().then((list) => ({ list, error: '' })).catch((e: unknown) => ({ list: [] as CloudBackup[], error: e instanceof Error ? e.message : 'تعذّر قراءة المخزن' })) : Promise.resolve({ list: [] as CloudBackup[], error: '' }),
    cloudOn ? cloudBackupStatus() : Promise.resolve(null),
    hasAction(session.uid, 'backup', 'add'),
    hasAction(session.uid, 'backup', 'edit'),
    hasAction(session.uid, 'backup', 'delete'),
  ]);

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-2">
        <DatabaseBackup className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-extrabold text-primary">النسخ الاحتياطي والاستعادة</h1>
      </div>

      {/* status banners */}
      {done === 'backup' && <Banner ok>تم إنشاء نسخة احتياطية جديدة{name ? `: ${name}` : ''}.</Banner>}
      {done === 'deleted' && <Banner ok>تم حذف النسخة الاحتياطية.</Banner>}
      {done === 'restore' && (
        <Banner ok>
          تمت الاستعادة من {name} بنجاح. حُفظت نسخة أمان تلقائية من الحالة السابقة{safety ? `: ${safety}` : ''} — يمكنك الرجوع إليها إن احتجت.
        </Banner>
      )}
      {done === 'cloudreq' && <Banner ok>سُجّل طلب النسخة. تبدأ خلال دقيقة تقريباً وتظهر في القائمة عند اكتمالها — حدّث الصفحة بعد دقيقتين.</Banner>}
      {done === 'cloudpending' && <Banner ok>يوجد طلب نسخة قيد التنفيذ بالفعل — انتظر اكتماله.</Banner>}
      {error && <Banner>{decodeURIComponent(error)}</Banner>}

      {/* النسخ الكاملة المشفّرة في المخزن السحابي */}
      {cloudOn && cloudStatus && (
        <section className="overflow-hidden rounded-2xl border-2 border-primary/15 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-[#142b45] to-[#234768] p-3 text-white">
            <h2 className="flex items-center gap-2 font-extrabold drop-shadow"><CloudUpload className="h-5 w-5" /> النسخ الكاملة في المخزن السحابي ({cloud.list.length})</h2>
          </div>
          <div className="space-y-3 p-4">
            <p className="text-sm font-bold text-muted-foreground">
              نسخة كاملة تؤخذ <b className="text-primary">تلقائياً كل يوم</b> وتُحفظ خارج الخادم: قاعدة البيانات مع توصيفها، والكود كاملاً، وإعدادات الخادم وأسراره.
              الصور والفيديوهات محفوظة أصلاً في مخزن الوسائط فلا تدخل النسخة.
            </p>
            <p className="flex items-start gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-900">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>كل نسخة <b>مشفّرة</b>، والملف الذي تنزّله لا يُفتح إلا بمفتاح التشفير المحفوظ عندك خارج الخادم. بدون المفتاح لا تُستعاد النسخة — احتفظ به في مدير كلمات المرور.</span>
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" /> آخر نسخة: {cloudStatus.lastAt ? fmtIso(cloudStatus.lastAt) : 'لم تُسجَّل بعد'}{cloudStatus.lastStatus ? ` — ${cloudStatus.lastStatus === 'ok' ? 'ناجحة' : `فشلت: ${cloudStatus.lastStatus}`}` : ''}</span>
              {cloudStatus.pending && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">طلب نسخة قيد التنفيذ منذ {fmtIso(cloudStatus.requestedAt)}</span>}
            </div>
            {canAdd && (
              <AccessBoundary module={'backup'} action={'create'}><form action={requestCloudBackupAction}>
                <Button className="gap-2" disabled={cloudStatus.pending}><CloudUpload className="h-4 w-4" /> {cloudStatus.pending ? 'النسخة قيد التنفيذ…' : 'خذ نسخة كاملة الآن'}</Button>
              </form></AccessBoundary>
            )}
            {cloud.error && <p className="text-xs font-bold text-destructive">تعذّر قراءة قائمة المخزن: {cloud.error}</p>}
          </div>
          <div className="divide-y border-t">
            {!cloud.error && cloud.list.length === 0 && <p className="p-4 text-sm font-bold text-muted-foreground">لا توجد نسخ في المخزن بعد.</p>}
            {cloud.list.map((b) => (
              <div key={b.key} className="flex flex-wrap items-start justify-between gap-2 p-3">
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-extrabold text-primary">{fmtIso(b.manifest?.createdAt || b.lastModified)} <span className="font-bold text-muted-foreground">· {fmtSize(b.size)}</span></div>
                  <ul className="space-y-0.5 text-xs font-bold text-muted-foreground">{describeBackup(b).map((line) => <li key={line}>• {line}</li>)}</ul>
                  <div className="truncate text-[11px] text-muted-foreground" dir="ltr">{b.name}</div>
                </div>
                <AccessBoundary module="backup" action="export"><a
                  href={`/admin/backup/cloud?key=${encodeURIComponent(b.key)}`}
                  className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-bold text-primary hover:bg-secondary"
                >
                  <Download className="h-4 w-4" /> تنزيل
                </a></AccessBoundary>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* create backup */}
      <section className="overflow-hidden rounded-2xl border-2 border-primary/15 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 p-3 text-white">
          <h2 className="flex items-center gap-2 font-extrabold drop-shadow"><HardDriveDownload className="h-5 w-5" /> إنشاء نسخة احتياطية</h2>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm font-bold text-muted-foreground">
            تأخذ نسخة كاملة من قاعدة البيانات (كل الأعضاء والإعلانات والإعدادات) وتحفظها على الخادم، ويمكنك تنزيلها لجهازك.
            {cloudOn && <b className="block text-amber-700">هذه نسخة سريعة مؤقتة لقاعدة البيانات فقط وتزول عند إعادة تشغيل الموقع — نزّلها فوراً. النسخ الدائمة هي التي في المخزن السحابي أعلاه.</b>}
            هذه العملية <b className="text-emerald-700">آمنة تماماً</b> ولا تؤثّر على الموقع.
          </p>
          {canAdd ? (
            <AccessBoundary module={'backup'} action={'create'}><form action={createBackupAction}>
              <Button className="gap-2"><HardDriveDownload className="h-4 w-4" /> إنشاء نسخة احتياطية الآن</Button>
            </form></AccessBoundary>
          ) : (
            <p className="text-xs font-bold text-muted-foreground">لا تملك صلاحية إنشاء نسخة.</p>
          )}
        </div>
      </section>

      {/* backups list */}
      <section className="overflow-hidden rounded-2xl border-2 border-primary/15 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-slate-600 to-slate-800 p-3 text-white">
          <h2 className="font-extrabold drop-shadow">النسخ المحفوظة ({backups.length})</h2>
        </div>
        <div className="divide-y">
          {backups.length === 0 && <p className="p-4 text-sm font-bold text-muted-foreground">لا توجد نسخ محفوظة بعد.</p>}
          {backups.map((b) => (
            <div key={b.name} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold text-primary">{b.name}</div>
                <div className="text-xs font-bold text-muted-foreground">{fmtDate(b.mtime)} · {b.sizeMB} ميغابايت</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <AccessBoundary module="backup" action="export"><a
                  href={`/admin/backup/download?name=${encodeURIComponent(b.name)}`}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-bold text-primary hover:bg-secondary"
                >
                  <Download className="h-4 w-4" /> تنزيل
                </a></AccessBoundary>
                {canDelete && (
                  <AccessBoundary module={'backup'} action={'delete'}><form action={deleteBackupAction}>
                    <input type="hidden" name="name" value={b.name} />
                    <ConfirmSubmit msg={`حذف النسخة الاحتياطية «${b.name}» نهائياً؟ لا يمكن التراجع.`} title="حذف" className="inline-flex h-9 items-center gap-1 rounded-lg border-2 border-destructive/30 px-3 text-sm font-bold text-destructive hover:bg-destructive/5">
                      <Trash2 className="h-4 w-4" /> حذف
                    </ConfirmSubmit>
                  </form></AccessBoundary>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* restore — dangerous */}
      {canRestore && backups.length > 0 && (
        <section className="overflow-hidden rounded-2xl border-2 border-red-300 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-red-600 to-red-800 p-3 text-white">
            <h2 className="flex items-center gap-2 font-extrabold drop-shadow"><ShieldAlert className="h-5 w-5" /> استعادة نسخة (خطير)</h2>
          </div>
          <div className="space-y-4 p-4">
            <div className="flex items-start gap-2 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="space-y-1">
                <p>تحذير: الاستعادة <b>تستبدل كل البيانات الحالية</b> ببيانات النسخة المختارة، وكل ما أُضيف بعد تاريخ تلك النسخة <b>سيُفقد</b>.</p>
                <p>لأمانك، يأخذ النظام <b>نسخة تلقائية من الحالة الحالية</b> قبل الاستعادة (باسم يبدأ بـ pre-restore) حتى تستطيع الرجوع.</p>
                <p>للتأكيد اكتب كلمة <b>«استعادة»</b> وعلّم الإقرار.</p>
              </div>
            </div>

            {backups.map((b) => (
              <AccessBoundary module={'backup'} action={'edit'} key={b.name}><form key={b.name} action={restoreBackupAction} className="rounded-xl border-2 border-red-200 p-3">
                <input type="hidden" name="name" value={b.name} />
                <div className="mb-2 text-sm font-extrabold text-primary">{b.name} <span className="font-bold text-muted-foreground">· {fmtDate(b.mtime)}</span></div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    name="confirm"
                    autoComplete="off"
                    placeholder="اكتب: استعادة"
                    className="h-10 w-36 rounded-lg border-2 border-red-300 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <label className="flex items-center gap-2 text-sm font-bold text-red-800">
                    <input type="checkbox" name="agree" className="h-4 w-4 accent-red-600" />
                    أُقرّ بأن الاستعادة تستبدل البيانات الحالية
                  </label>
                  <button className="inline-flex h-10 items-center gap-1 rounded-lg bg-red-600 px-4 text-sm font-extrabold text-white hover:bg-red-700">
                    <RotateCcw className="h-4 w-4" /> استعادة هذه النسخة
                  </button>
                </div>
              </form></AccessBoundary>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Banner({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border-2 p-3 text-sm font-bold ${ok ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'}`}>
      {ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}
