import Link from 'next/link';
import { Copy, Trash2, Check } from 'lucide-react';
import { requirePerm } from '@/lib/roles';
import { findDuplicateAds, findCrossUserImages } from '@/lib/duplicates';
import { mediaUrl } from '@/lib/media';
import { timeAgo } from '@/lib/utils';
import { adminDeleteDuplicatesAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الإعلانات المكررة' };

export default async function AdminDuplicates({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requirePerm('duplicates');
  const sp = await searchParams;
  const [{ groups, dupCount }, stolen] = await Promise.all([findDuplicateAds(), findCrossUserImages(20)]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Copy className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">الإعلانات المكررة</h1>
      </div>

      {sp.deleted !== undefined && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <Check className="h-4 w-4" /> تم حذف <b>{sp.deleted}</b> إعلاناً مكرراً.
        </div>
      )}

      <div className="rounded-xl border border-primary/20 bg-card p-4 text-sm">
        عدد المجموعات المكررة: <b>{groups.length}</b> — إجمالي النسخ الزائدة القابلة للحذف: <b>{dupCount}</b>
        <p className="mt-1 text-xs text-muted-foreground">يُحتفظ دائماً بأقدم إعلان في كل مجموعة، وتُحذف النسخ المكررة الأحدث فقط (لنفس صاحب الإعلان وبنفس العنوان والتفاصيل).</p>
      </div>

      {dupCount > 0 && (
        <form action={adminDeleteDuplicatesAction}>
          <button className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-bold text-white">
            <Trash2 className="h-4 w-4" /> حذف كل المكرر ({dupCount})
          </button>
        </form>
      )}

      {groups.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد إعلانات مكررة. 🎉</p>}

      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.key} className="rounded-xl border border-primary/20 bg-card p-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">يُبقى</span>
              <Link href={`/ads/${g.keepId}`} className="truncate font-medium hover:text-primary">{g.keepTitle}</Link>
              <span className="text-xs text-muted-foreground">#{g.keepId}</span>
            </div>
            <ul className="mt-2 space-y-1 border-t pt-2">
              {g.dups.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-red-100 px-2 py-0.5 font-medium text-red-700">مكرر</span>
                  <Link href={`/ads/${d.id}`} className="truncate hover:text-primary">#{d.id}</Link>
                  <span>{timeAgo(d.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    

      {/* نفس الصورة من أكثر من عضو — مؤشر سرقة صور إعلانات */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-red-600">🕵️ صور مستخدمة من أكثر من عضو</h2>
        <p className="text-sm text-muted-foreground">مطابقة بالبصمة البصرية (pHash): نفس الصورة مرفوعة من أعضاء مختلفين — غالباً سرقة صور إعلانات. راجع الأعضاء واتخذ الإجراء.</p>
        {stolen.length === 0 && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ لا توجد صور متطابقة بين أعضاء مختلفين.</p>}
        {stolen.map((g) => (
          <div key={g.phash} className="card-3d flex flex-wrap items-center gap-3 rounded-xl p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(g.files[0].file)} alt="صورة مكررة" className="h-20 w-20 rounded-lg object-cover" />
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <div className="font-bold text-red-600">نفس الصورة لدى {g.files.length} أعضاء:</div>
              <div className="flex flex-wrap gap-1.5">
                {g.files.map((f) => (
                  <Link key={f.userId} href={`/admin/users/${f.userId}`} className="rounded-full border border-primary/25 bg-primary/5 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/10">{f.userName}</Link>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
