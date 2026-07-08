import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { getThread } from '@/lib/messages';
import { getMsgDeleteMinutes, getAdMsgTemplates, getAdminMsgTemplates, parseTemplates } from '@/lib/settings';
import { getPrimaryAdminId } from '@/lib/admin-inbox';
import { storeIdOfUser, getStoreMeta } from '@/lib/merchant';
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

  // نصوص المراسلة الجاهزة: للإدارة نصوص تربح الإدارية، ولصاحب متجر نصوصه الخاصة
  // (تظهر لعملائه فقط)، وللمعلن العادي نصوص تربح لمراسلة صاحب الإعلان.
  const adminId = await getPrimaryAdminId().catch(() => 0);
  let templates: string[] = [];
  if (adminId && otherId === adminId) {
    templates = await getAdminMsgTemplates().catch(() => []);
  } else {
    const peerStoreId = await storeIdOfUser(otherId).catch(() => 0);
    if (peerStoreId > 0) {
      const meta = await getStoreMeta(peerStoreId).catch(() => null);
      templates = parseTemplates(meta?.msgTemplates);
    }
    if (!templates.length) templates = await getAdMsgTemplates().catch(() => []);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/messages" className="rounded-lg p-2 hover:bg-secondary"><ArrowRight className="h-5 w-5" /></Link>
        <Link href={`/users/${thread.other.id}`} className="font-bold hover:text-primary">{thread.other.name}</Link>
      </div>

      <DisclaimerBar className="mb-3" />

      <ChatRoom peerId={otherId} initial={thread.messages} deleteWindowMin={delWindow} templates={templates} />
    </div>
  );
}
