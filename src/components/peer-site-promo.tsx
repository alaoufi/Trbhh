import { ChevronLeft } from 'lucide-react';
import { getPeerSite } from '@/lib/settings';

/**
 * بطاقة ربط بالموقع الشقيق (تربح ⇄ تربح للعقار) — تظهر في صفحة الإعلان للتنقّل
 * بين المنصّتين. بياناتها من الإعدادات (لكل نشرة موقعها الآخر)، فلا تظهر حتى
 * تُفعَّل ويُضبط رابطها من لوحة الإدارة. رابط مباشر للموقع الآخر (الدخول موحّد
 * فيدرالياً عند التسجيل، فبيانات الدخول نفسها تعمل هناك).
 */
export async function PeerSitePromo() {
  const p = await getPeerSite();
  if (!p.on || !p.url) return null;
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      className="card-3d flex items-center gap-3 rounded-2xl border-2 border-primary/15 p-3 transition hover:border-primary/40"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-2xl">{p.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="font-extrabold text-primary">{p.label}</div>
        {p.desc && <div className="line-clamp-1 text-xs text-muted-foreground">{p.desc}</div>}
      </div>
      <ChevronLeft className="h-5 w-5 shrink-0 text-primary" />
    </a>
  );
}
