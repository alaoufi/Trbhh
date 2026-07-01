import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowRight, Send } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { getThread } from '@/lib/messages';
import { timeAgo, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DisclaimerBar } from '@/components/disclaimer';
import { sendMessageAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ThreadPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { userId } = await params;
  const otherId = Number(userId);
  if (otherId === session.uid) redirect('/messages');
  const thread = await getThread(session.uid, otherId);
  if (!thread.other) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/messages" className="rounded-lg p-2 hover:bg-secondary"><ArrowRight className="h-5 w-5" /></Link>
        <Link href={`/users/${thread.other.id}`} className="font-bold hover:text-primary">{thread.other.name}</Link>
      </div>

      <DisclaimerBar className="mb-3" />

      <div className="flex min-h-[45vh] flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm">
        {thread.messages.length === 0 && <p className="m-auto text-sm text-muted-foreground">ابدأ المحادثة الآن</p>}
        {thread.messages.map((m) => (
          <div key={m.id} className={cn('max-w-[75%] rounded-2xl px-3 py-2 text-sm', m.fromMe ? 'self-start bg-primary text-primary-foreground' : 'self-end bg-secondary')}>
            <p>{m.message}</p>
            <span className={cn('mt-1 block text-[10px]', m.fromMe ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{timeAgo(m.at)}</span>
          </div>
        ))}
      </div>

      <form action={sendMessageAction} className="mt-3 flex gap-2">
        <input type="hidden" name="reciverId" value={otherId} />
        <input name="message" required autoComplete="off" placeholder="اكتب رسالة..." className="h-11 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <Button size="icon" aria-label="إرسال"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
