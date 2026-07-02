import { Sparkles, Trash2, ExternalLink } from 'lucide-react';
import { getAllClassifieds } from '@/lib/classified';
import { CLASSIFIED_THEMES } from '@/lib/classified-theme';
import { timeAgo } from '@/lib/utils';
import { adminDeleteClassifiedAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة الإعلانات المبوّبة' };

export default async function AdminClassified() {
  const items = await getAllClassifieds(120);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">الإعلانات المبوّبة ({items.length})</h1>
      </div>
      {items.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد إعلانات مبوّبة.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((c) => {
          const t = CLASSIFIED_THEMES[c.theme % CLASSIFIED_THEMES.length];
          return (
            <div key={c.id} className="flex items-center gap-3 card-3d rounded-xl p-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-cover bg-center" style={c.image ? { backgroundImage: `url(${c.image})` } : { backgroundImage: `linear-gradient(150deg, ${t.from}, ${t.to})` }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.title || c.text || '(بدون نص)'}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>#{c.id}</span>
                  <span>{timeAgo(c.createdAt)}</span>
                  {c.link && <a href={c.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary"><ExternalLink className="h-3 w-3" /> رابط</a>}
                </div>
              </div>
              <form action={adminDeleteClassifiedAction}>
                <input type="hidden" name="id" value={c.id} />
                <button className="rounded-md border border-destructive/30 p-1.5 text-destructive hover:bg-destructive/10" title="حذف"><Trash2 className="h-4 w-4" /></button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
