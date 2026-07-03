import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { getThread } from '@/lib/messages';
import { getMsgDeleteMinutes } from '@/lib/settings';
import { DisclaimerBar } from '@/components/disclaimer';
import { ChatRoom } from '@/components/chat-room';

export const dynamic = 'force-dynamic';

export default async function ThreadPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { userId } = await params;
  const otherId = Number(userId);
  if (otherId === session.uid) redirect('/messages');
  const [thread, delWindow] = await Promise.all([getThread(session.uid, otherId), getMsgDeleteMinutes()]);
  if (!thread.other) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/messages" className="rounded-lg p-2 hover:bg-secondary"><ArrowRight className="h-5 w-5" /></Link>
        <Link href={`/users/${thread.other.id}`} className="font-bold hover:text-primary">{thread.other.name}</Link>
      </div>

      <DisclaimerBar className="mb-3" />

      <ChatRoom peerId={otherId} initial={thread.messages} deleteWindowMin={delWindow} />
    </div>
  );
}
