import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowRight, Star, Ban, ShieldOff } from 'lucide-react';
import { blockUserAction, unblockUserAction } from '@/app/messages/actions';
import { getSession } from '@/lib/auth';
import { getThread } from '@/lib/messages';
import { getMsgDeleteMinutes, getAdMsgTemplates, getAdminMsgTemplates, getSupportTemplates, parseTemplates, fillTemplate } from '@/lib/settings';
import { getPrimaryAdminId } from '@/lib/admin-inbox';
import { storeIdOfUser, getStoreMeta } from '@/lib/merchant';
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
  // حالة الحظر: لا مراسلة إن حظر أحد الطرفين الآخر (لا نعرض المحرّر)
  const { blockedBetween, hasBlocked } = await import('@/lib/blocks');
  const [blocked, iBlocked] = await Promise.all([blockedBetween(session.uid, otherId), hasBlocked(session.uid, otherId)]);

  // نصوص المراسلة الجاهزة: للإدارة نصوص عقار تربح الإدارية، ولصاحب متجر نصوصه الخاصة
  // (تظهر لعملائه فقط)، وللمعلن العادي نصوص عقار تربح لمراسلة صاحب الإعلان.
  const adminId = await getPrimaryAdminId().catch(() => 0);
  let templates: string[] = [];
  if (adminId && session.uid === adminId) {
    // الإدارة تردّ على عضو: ردود الدعم الجاهزة (تُعدَّل من النصوص ← المراسلة)
    templates = await getSupportTemplates().catch(() => []);
  } else if (adminId && otherId === adminId) {
    templates = await getAdminMsgTemplates().catch(() => []);
  } else {
    const peerStoreId = await storeIdOfUser(otherId).catch(() => 0);
    if (peerStoreId > 0) {
      const meta = await getStoreMeta(peerStoreId).catch(() => null);
      templates = parseTemplates(meta?.msgTemplates);
    }
    if (!templates.length) templates = await getAdMsgTemplates().catch(() => []);
  }
  // لا رابط في المحادثة الداخلية → أزل {link}؛ {name} = اسم الطرف الآخر
  templates = templates.map((t) => fillTemplate(t, { name: thread.other?.name })).filter(Boolean);

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/messages" className="rounded-lg p-2 hover:bg-secondary"><ArrowRight className="h-5 w-5" /></Link>
        <Link href={`/users/${thread.other.id}`} className="flex-1 font-bold hover:text-primary">{thread.other.name}</Link>
        {/* حظر/رفع حظر — لا يُحظر حساب الإدارة */}
        {otherId !== adminId && (
          iBlocked ? (
            <form action={unblockUserAction}>
              <input type="hidden" name="userId" value={otherId} />
              <button type="submit" title="رفع الحظر" className="flex items-center gap-1 rounded-lg border border-primary/30 px-2 py-1 text-xs font-bold text-primary hover:bg-accent"><ShieldOff className="h-3.5 w-3.5" /> رفع الحظر</button>
            </form>
          ) : (
            <form action={blockUserAction}>
              <input type="hidden" name="userId" value={otherId} />
              <button type="submit" title="حظر" className="flex items-center gap-1 rounded-lg border border-destructive/30 px-2 py-1 text-xs font-bold text-destructive hover:bg-destructive/10"><Ban className="h-3.5 w-3.5" /> حظر</button>
            </form>
          )
        )}
      </div>

      {/* بعد محادثة نشطة: دعوة لتقييم التجربة (ليست للإدارة) */}
      {adminId !== otherId && session.uid !== adminId && thread.messages.length >= 4 && (
        <Link href={`/users/${otherId}#review`} className="mb-3 flex items-center gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-2.5 text-sm font-bold text-amber-900 hover:border-amber-400">
          <Star className="h-4 w-4 shrink-0 text-amber-500" /> هل تمت الصفقة؟ قيّم تجربتك مع {thread.other.name} — تقييمك يساعد بقية الأعضاء
        </Link>
      )}

      {blocked ? (
        <div className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-4 text-center text-sm font-bold text-destructive">
          {iBlocked ? 'أنت حظرت هذا العضو — لا يمكنكما تبادل الرسائل. ارفع الحظر لاستئناف المراسلة.' : 'لا يمكن مراسلة هذا العضو حالياً.'}
        </div>
      ) : (
        <ChatRoom peerId={otherId} initial={thread.messages} deleteWindowMin={delWindow} templates={templates} />
      )}
    </div>
  );
}
