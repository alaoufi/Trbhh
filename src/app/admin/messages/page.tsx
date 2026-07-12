import Link from 'next/link';
import { MessagesSquare, Trash2, ArrowRight } from 'lucide-react';
import { requirePerm, hasAction } from '@/lib/roles';
import { listAllConversations, getAdminThread } from '@/lib/chat';
import { timeAgo } from '@/lib/utils';
import { adminDeleteMessageAction } from '../actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مراقبة المراسلات' };

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);

export default async function AdminMessages({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const session = await requirePerm('messages');
  const { a, b } = await searchParams;
  const ai = Number(a) || 0;
  const bi = Number(b) || 0;

  // Thread view
  if (ai && bi) {
    const [thread, canDelete] = await Promise.all([
      getAdminThread(ai, bi),
      hasAction(session.uid, 'messages', 'delete'),
    ]);
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <Link href="/admin/messages" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
          <ArrowRight className="h-4 w-4" /> كل المحادثات
        </Link>
        <h1 className="flex items-center gap-2 text-lg font-bold text-primary">
          <MessagesSquare className="h-5 w-5" /> {thread.aName} ↔ {thread.bName}
        </h1>
        <p className="text-xs text-muted-foreground">عرض إداري للمحادثة. يمكنك حذف أي رسالة غير لائقة.</p>
        <div className="flex flex-col gap-1.5 rounded-xl p-3" style={{ background: '#e5ddd5' }}>
          {thread.messages.length === 0 && <p className="m-auto py-6 text-sm text-gray-600">لا رسائل.</p>}
          {thread.messages.map((m) => (
            <div key={m.id} className="max-w-[85%] self-start rounded-2xl bg-white px-3 py-1.5 text-sm shadow-sm">
              <div className="mb-0.5 text-[11px] font-bold text-primary">{m.senderName}</div>
              <p className="whitespace-pre-wrap break-words leading-relaxed text-gray-900">{m.message}</p>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-gray-500">
                <span>{timeAgo(m.at)}</span>
                {canDelete && (
                  <form action={adminDeleteMessageAction}>
                    <input type="hidden" name="messageId" value={m.id} />
                    <ConfirmSubmit msg="حذف هذه الرسالة نهائياً؟ لا يمكن التراجع." title="حذف الرسالة" className="flex items-center gap-1 text-red-500 hover:text-red-700">
                      <Trash2 className="h-3.5 w-3.5" /> حذف
                    </ConfirmSubmit>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Conversations list
  const convos = await listAllConversations(150);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessagesSquare className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">مراقبة المراسلات</h1>
      </div>
      <p className="text-sm text-muted-foreground">أحدث المحادثات بين الأعضاء. افتح أي محادثة لمراجعتها وحذف الرسائل غير اللائقة.</p>
      {convos.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد محادثات.</p>}
      <div className="space-y-2">
        {convos.map((c) => (
          <Link key={`${c.a}-${c.b}`} href={`/admin/messages?a=${c.a}&b=${c.b}`} className="flex items-center gap-3 card-3d rounded-xl p-3 hover:border-primary/40">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><MessagesSquare className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-primary">{c.aName} ↔ {c.bName}</span>
              <span className="block truncate text-xs text-muted-foreground">{c.last}</span>
            </span>
            <span className="shrink-0 text-left text-[11px] text-muted-foreground">
              <span className="block rounded-full bg-secondary px-2 py-0.5">{en(c.count)} رسالة</span>
              <span className="mt-1 block">{timeAgo(c.at)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
