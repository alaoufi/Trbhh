import { Ban, Trash2 } from 'lucide-react';
import { requireAdmin } from '@/lib/admin';
import { getBannedWords } from '@/lib/censor';
import { Button } from '@/components/ui/button';
import { addBannedWordAction, deleteBannedWordAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الكلمات المرفوضة' };

export default async function AdminWords() {
  await requireAdmin();
  const words = await getBannedWords();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Ban className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">الكلمات المرفوضة ({words.length})</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        الكلمات هنا تُحجب في الإعلانات والتعليقات وتظهر مظلّلة بالأسود (كلمة كاملة فقط — لا تُحجب إن كانت جزءاً من كلمة أخرى).
      </p>

      <form action={addBannedWordAction} className="flex gap-2">
        <input name="word" required maxLength={100} placeholder="أضف كلمة مرفوضة" className="h-11 flex-1 rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
        <Button>إضافة</Button>
      </form>

      {words.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد كلمات مرفوضة بعد.</p>}
      <div className="flex flex-wrap gap-2">
        {words.map((w) => (
          <div key={w.id} className="flex items-center gap-2 rounded-lg border border-primary/20 bg-card px-3 py-2 text-sm">
            <span className="font-medium">{w.word}</span>
            <form action={deleteBannedWordAction}>
              <input type="hidden" name="id" value={w.id} />
              <button className="text-destructive hover:opacity-70" title="حذف"><Trash2 className="h-4 w-4" /></button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
