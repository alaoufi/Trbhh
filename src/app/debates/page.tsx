import Link from 'next/link';
import { MessagesSquare, Heart, MessageCircle } from 'lucide-react';
import { getDebates } from '@/lib/debates';
import { timeAgo } from '@/lib/utils';

export const revalidate = 60;
export const metadata = { title: 'النقاشات' };

export default async function DebatesPage() {
  const debates = await getDebates();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <MessagesSquare className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold">النقاشات</h1>
      </div>
      {debates.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد نقاشات حالياً.</p>}
      <ul className="space-y-3">
        {debates.map((d) => (
          <li key={d.id}>
            <Link href={`/debates/${d.id}`} className="block rounded-xl border bg-card p-4 shadow-sm hover:border-primary">
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
