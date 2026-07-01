import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Heart, Send, ArrowRight } from 'lucide-react';
import { getDebate } from '@/lib/debates';
import { getSession } from '@/lib/auth';
import { timeAgo, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { addDebateCommentAction, toggleDebateLikeAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function DebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const d = await getDebate(Number(id), session?.uid);
  if (!d) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/debates" className="rounded-lg p-2 hover:bg-secondary"><ArrowRight className="h-5 w-5" /></Link>
        <h1 className="text-xl font-bold">{d.title}</h1>
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        {d.description && <p className="whitespace-pre-line leading-7">{d.description}</p>}
        <div className="mt-3 flex items-center gap-3 border-t pt-3">
          <form action={toggleDebateLikeAction}>
            <input type="hidden" name="debateId" value={d.id} />
            <button disabled={!session} className={cn('flex items-center gap-1 rounded-lg border px-3 py-1 text-sm', d.liked && 'border-destructive/40 bg-destructive/5 text-destructive', !session && 'opacity-60')}>
              <Heart className={cn('h-4 w-4', d.liked && 'fill-current')} /> {d.likes}
            </button>
          </form>
          <span className="text-xs text-muted-foreground">{timeAgo(d.createdAt)}</span>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="mb-3 font-bold">المشاركات ({d.comments.length})</h2>
        {session ? (
          <form action={addDebateCommentAction} className="mb-4 flex gap-2">
            <input type="hidden" name="debateId" value={d.id} />
            <input name="comment" required placeholder="شارك برأيك..." className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <Button size="icon" aria-label="إرسال"><Send className="h-4 w-4" /></Button>
          </form>
        ) : (
          <Link href="/login" className="mb-4 block text-sm text-primary hover:underline">سجّل الدخول للمشاركة</Link>
        )}
        <ul className="space-y-3">
          {d.comments.map((c) => (
            <li key={c.id} className="flex gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground">{c.author.charAt(0)}</span>
              <div className="rounded-lg bg-secondary p-2">
                <div className="flex items-center gap-2"><span className="text-sm font-semibold">{c.author}</span><span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span></div>
                <p className="text-sm">{c.comment}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
