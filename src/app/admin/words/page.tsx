import { Ban, Trash2, UserX } from 'lucide-react';
import { requirePerm } from '@/lib/roles';
import { getBannedWords, getNameWords } from '@/lib/censor';
import { Button } from '@/components/ui/button';
import { addBannedWordAction, deleteBannedWordAction, addNameWordAction, deleteNameWordAction } from '../actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الكلمات المرفوضة' };

export default async function AdminWords() {
  await requirePerm('words');
  const [words, nameWords] = await Promise.all([getBannedWords(), getNameWords()]);
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
              <ConfirmSubmit msg={`حذف كلمة «${w.word}» من القائمة؟`} title="حذف" className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></ConfirmSubmit>
            </form>
          </div>
        ))}
      </div>

      {/* ===== كلمات وجمل ممنوعة في الأسماء (العضو والمتجر) — قائمة مستقلة ===== */}
      <div className="mt-6 space-y-3 border-t-2 border-primary/10 pt-5">
        <div className="flex items-center gap-2">
          <UserX className="h-6 w-6 text-red-600" />
          <h2 className="text-lg font-bold text-red-700">كلمات وجمل ممنوعة في الأسماء ({nameWords.length})</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          تمنع تسمية <b>عضو أو متجر</b> بها (لا تُقبل إلا من الإدارة). أضف <b>كلمة</b> لمنعها وحدها
          (مثل: جمعية، الملك)، أو <b>جملة كاملة</b> فتُمنع الجملة مجتمعةً فقط — مثال: «الملك سلمان»
          ممنوعة بينما «سلمان» وحدها مقبولة. الكلمات المسيئة في قائمة الحجب أعلاه تُمنع في الأسماء تلقائياً أيضاً.
        </p>
        <form action={addNameWordAction} className="flex gap-2">
          <input name="word" required maxLength={120} placeholder="أضف كلمة أو جملة (مثال: جمعية خيرية)" className="h-11 flex-1 rounded-lg border border-red-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-red-300" />
          <Button className="bg-red-600 hover:bg-red-700">إضافة</Button>
        </form>
        {nameWords.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">لا توجد كلمات/جمل بعد.</p>}
        <div className="flex flex-wrap gap-2">
          {nameWords.map((w) => (
            <div key={w.id} className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-sm">
              <span className="font-medium">{w.word}</span>
              <form action={deleteNameWordAction}>
                <input type="hidden" name="id" value={w.id} />
                <ConfirmSubmit msg={`حذف «${w.word}» من قائمة أسماء المتاجر الممنوعة؟`} title="حذف" className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></ConfirmSubmit>
              </form>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
