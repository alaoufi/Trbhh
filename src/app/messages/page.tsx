import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MessageCircle, Send } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { getConversations } from '@/lib/messages';
import { timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مراسلات الإدارة' };

export default async function MessagesPage() {
 const session = await getSession();
 if (!session) redirect('/login');
 const convos = await getConversations(session.uid);
 return (
 <div className="mx-auto max-w-2xl space-y-4">
 <div className="flex items-center justify-between gap-2">
 <h1 className="text-xl font-bold">مراسلات الإدارة</h1>
 <Link href="/messages/admin" className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90">
 <Send className="h-4 w-4" /> مراسلة الإدارة
 </Link>
 </div>
 {convos.length === 0 && (
 <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
 <MessageCircle className="mx-auto mb-2 h-8 w-8" />
 لا توجد محادثات بعد.
 </div>
 )}
 <ul className="divide-y card-3d rounded-xl ">
 {convos.map((c) => (
 <li key={c.otherId}>
 <Link href={`/messages/${c.otherId}`} className="flex items-center gap-3 p-3 hover:bg-secondary">
 <span className="grid h-11 w-11 place-items-center rounded-full bg-accent font-bold text-accent-foreground">{c.name.charAt(0)}</span>
 <div className="min-w-0 flex-1">
 <div className="flex items-center justify-between">
 <span className="font-semibold">{c.name}</span>
 <span className="text-xs text-muted-foreground">{timeAgo(c.at)}</span>
 </div>
 <p className="line-clamp-1 text-sm text-muted-foreground">{c.last}</p>
 </div>
 {c.unread > 0 && <Badge variant="special">{c.unread}</Badge>}
 </Link>
 </li>
 ))}
 </ul>
 </div>
 );
}
