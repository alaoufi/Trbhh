import { ShieldAlert, Trash2, Plus } from 'lucide-react';
import { requirePerm } from '@/lib/roles';
import { getGuardWords, BUILTIN, CATEGORY_LABEL, GUARD_CATEGORIES, type GuardCategory } from '@/lib/content-guard';
import { Button } from '@/components/ui/button';
import { addGuardWordAction, deleteGuardWordAction } from '../actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'كلمات حارس المحتوى' };

const COLORS: Record<GuardCategory, string> = {
  immoral: 'from-red-600 to-red-800',
  drugs: 'from-orange-500 to-orange-700',
  weapons: 'from-slate-600 to-slate-800',
  political: 'from-amber-500 to-amber-700',
  charity: 'from-teal-600 to-teal-800',
};

export default async function GuardWordsPage() {
  await requirePerm('words');
  const custom = await getGuardWords();
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-extrabold text-primary">كلمات حارس المحتوى</h1>
      </div>
      <p className="text-sm font-bold text-muted-foreground">
        الحارس يمنع أي إعلان يحتوي هذه الكلمات ضمن فئته. المحتوى <b className="text-red-700">غير الأخلاقي يحظر الحساب فوراً</b>.
        القوائم الأساسية مدمجة، ويمكنك إضافة كلمات مخصّصة لكل فئة.
      </p>

      {GUARD_CATEGORIES.map((cat) => {
        const words = custom.filter((w) => w.category === cat);
        return (
          <section key={cat} className="overflow-hidden rounded-2xl border-2 border-primary/15 bg-white shadow-sm">
            <div className={`bg-gradient-to-br ${COLORS[cat]} p-3 text-white`}>
              <h2 className="font-extrabold drop-shadow">{CATEGORY_LABEL[cat]}</h2>
            </div>
            <div className="space-y-3 p-3">
              <form action={addGuardWordAction} className="flex gap-2">
                <input type="hidden" name="category" value={cat} />
                <input name="word" required maxLength={120} placeholder="أضف كلمة/عبارة للحظر…" className="h-10 flex-1 rounded-lg border-2 border-primary/25 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/40" />
                <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> إضافة</Button>
              </form>

              {words.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-extrabold text-primary">كلمات مخصّصة ({words.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {words.map((w) => (
                      <span key={w.id} className="flex items-center gap-1.5 rounded-lg border-2 border-primary/20 bg-accent/30 px-2.5 py-1 text-sm font-bold">
                        {w.word}
                        <form action={deleteGuardWordAction}>
                          <input type="hidden" name="id" value={w.id} />
                          <ConfirmSubmit msg={`حذف كلمة «${w.word}» من كلمات الحماية؟`} title="حذف" className="text-destructive hover:opacity-70"><Trash2 className="h-3.5 w-3.5" /></ConfirmSubmit>
                        </form>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-xs">
                <p className="mb-1 font-extrabold text-muted-foreground">القائمة الأساسية المدمجة ({BUILTIN[cat].length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {BUILTIN[cat].map((w) => (
                    <span key={w} className="rounded bg-muted px-2 py-0.5 font-bold text-muted-foreground">{w}</span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
