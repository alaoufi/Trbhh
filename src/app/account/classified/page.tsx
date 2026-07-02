import Link from 'next/link';
import { Sparkles, Pencil, Trash2, Plus, Check, ExternalLink } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getMyClassifieds } from '@/lib/classified';
import { ClassifiedCard } from '@/components/classified-card';
import { deleteMyClassifiedAction } from '@/app/classified/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إعلاناتي المبوّبة' };

export default async function MyClassifiedPage({ searchParams }: { searchParams: Promise<{ updated?: string; deleted?: string; error?: string }> }) {
  const session = await requireUser();
  const [items, sp] = await Promise.all([getMyClassifieds(session.uid), searchParams]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-primary">إعلاناتي المبوّبة ({items.length})</h1>
        </div>
        <Link href="/classified/new" className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">
          <Plus className="h-4 w-4" /> إعلان جديد
        </Link>
      </div>

      {sp.updated === '1' && <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800"><Check className="h-4 w-4" /> تم حفظ التعديلات.</div>}
      {sp.deleted === '1' && <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800"><Check className="h-4 w-4" /> تم حذف الإعلان.</div>}
      {sp.error === 'deleteWindow' && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">انتهت المدة المسموح بها لحذف الإعلان حسب إعدادات الموقع. للحذف تواصل مع الإدارة.</div>}

      {items.length === 0 ? (
        <div className="card-3d rounded-2xl p-8 text-center">
          <p className="text-muted-foreground">لا توجد لديك إعلانات مبوّبة بعد.</p>
          <Link href="/classified/new" className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">صمّم أول إعلان</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {items.map((c) => (
            <div key={c.id} className="space-y-1.5">
              <ClassifiedCard c={c} float={false} />
              <div className="flex gap-1.5">
                <Link href={`/classified/${c.id}/edit`} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-primary/30 py-1.5 text-xs font-medium text-primary hover:bg-accent">
                  <Pencil className="h-3.5 w-3.5" /> تعديل
                </Link>
                <form action={deleteMyClassifiedAction} className="flex-1">
                  <input type="hidden" name="id" value={c.id} />
                  <button className="flex w-full items-center justify-center gap-1 rounded-lg border border-destructive/30 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5" /> حذف
                  </button>
                </form>
              </div>
              {c.link && (
                <a href={c.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-primary">
                  <ExternalLink className="h-3 w-3" /> الرابط
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
