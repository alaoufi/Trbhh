import { DatabaseBackup, Download, Trash2, AlertTriangle, ShieldAlert, Check, HardDriveDownload, RotateCcw } from 'lucide-react';
import { requireAction, hasAction } from '@/lib/roles';
import { listBackups } from '@/lib/backup';
import { Button } from '@/components/ui/button';
import { createBackupAction, deleteBackupAction, restoreBackupAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'النسخ الاحتياطي والاستعادة' };

function fmtDate(ms: number): string {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

export default async function BackupPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string; name?: string; safety?: string }> }) {
  const session = await requireAction('backup', 'view');
  const [{ done, error, name, safety }, backups, canAdd, canRestore, canDelete] = await Promise.all([
    searchParams,
    listBackups(),
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
      {error && <Banner>{decodeURIComponent(error)}</Banner>}

      {/* create backup */}
      <section className="overflow-hidden rounded-2xl border-2 border-primary/15 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 p-3 text-white">
          <h2 className="flex items-center gap-2 font-extrabold drop-shadow"><HardDriveDownload className="h-5 w-5" /> إنشاء نسخة احتياطية</h2>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm font-bold text-muted-foreground">
            تأخذ نسخة كاملة من قاعدة البيانات (كل الأعضاء والإعلانات والإعدادات) وتحفظها على الخادم، ويمكنك تنزيلها لجهازك.
            هذه العملية <b className="text-emerald-700">آمنة تماماً</b> ولا تؤثّر على الموقع.
          </p>
          {canAdd ? (
            <form action={createBackupAction}>
              <Button className="gap-2"><HardDriveDownload className="h-4 w-4" /> إنشاء نسخة احتياطية الآن</Button>
            </form>
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
                <a
                  href={`/admin/backup/download?name=${encodeURIComponent(b.name)}`}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-bold text-primary hover:bg-secondary"
                >
                  <Download className="h-4 w-4" /> تنزيل
                </a>
                {canDelete && (
                  <form action={deleteBackupAction}>
                    <input type="hidden" name="name" value={b.name} />
                    <button className="inline-flex h-9 items-center gap-1 rounded-lg border-2 border-destructive/30 px-3 text-sm font-bold text-destructive hover:bg-destructive/5" title="حذف">
                      <Trash2 className="h-4 w-4" /> حذف
                    </button>
                  </form>
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
              <form key={b.name} action={restoreBackupAction} className="rounded-xl border-2 border-red-200 p-3">
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
              </form>
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
