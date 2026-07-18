import Link from 'next/link';
import { MessagesSquare, Heart, MessageCircle, Send } from 'lucide-react';
import { getDebates } from '@/lib/debates';
import { redirect } from 'next/navigation';
import { debatesEnabled } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { createDebateAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'النقاشات' };

export default async function DebatesPage({ searchParams }: { searchParams?: Promise<{ error?: 'blocked' | 'duplicate' | 'banned' | 'flood' }> }) {
  if (!(await debatesEnabled().catch(() => true))) redirect('/');
  const [debates, session] = await Promise.all([getDebates(), getSession()]);
  const sp = searchParams ? await searchParams : {};
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {sp.error === 'blocked' && <div className="rounded-lg border-2 border-red-400 bg-red-50 p-2.5 text-sm font-bold text-red-800">نقاشك يحتوي محتوى ممنوعاً ولم يُنشر — تكرار المخالفة يعرّض حسابك للحظر.</div>}
      {sp.error === 'duplicate' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-2.5 text-sm font-bold text-amber-900">⚠️ هذا الموضوع مطابق لموضوع سابق طرحته — تكرار المحاولة يعرّض حسابك للحظر.</div>}
      {sp.error === 'banned' && <div className="rounded-lg border-2 border-red-400 bg-red-50 p-2.5 text-sm font-bold text-red-800">🚫 تم حظر حسابك بعد تكرار طرح مواضيع مطابقة.</div>}
      {sp.error === 'flood' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-2.5 text-sm font-bold text-amber-900">⏳ أنت تنشر بسرعة كبيرة — انتظر قليلاً قبل طرح موضوع آخر.</div>}
      <div className="flex items-center gap-2">
        <MessagesSquare className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">النقاشات</h1>
      </div>

      {session ? (
        <form action={createDebateAction} className="card-3d space-y-3 rounded-2xl p-4">
          <p className="text-sm font-bold text-primary">اطرح نقاشاً جديداً</p>
          <input name="title" required maxLength={255} placeholder="عنوان النقاش" className="h-11 w-full rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          <textarea name="description" rows={3} placeholder="تفاصيل النقاش (اختياري)" className="w-full rounded-lg border border-primary/30 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          <Button className="gap-2"><Send className="h-4 w-4" /> نشر النقاش</Button>
        </form>
      ) : (
        <Link href="/login" className="card-3d block rounded-2xl p-3 text-center text-sm text-primary">سجّل الدخول لطرح نقاش</Link>
      )}

      {debates.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد نقاشات حالياً.</p>}
      <ul className="space-y-3">
        {debates.map((d) => (
          <li key={d.id}>
            <Link href={`/debates/${d.id}`} className="block card-3d rounded-xl p-4 hover:border-primary">
              <h2 className="font-bold">{d.title}</h2>
              {d.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{d.description}</p>}
              <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {d.comments}</span>
                <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {d.likes}</span>
                <span>{timeAgo(d.createdAt)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
