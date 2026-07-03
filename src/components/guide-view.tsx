import { ArrowUp, Target, ListChecks } from 'lucide-react';
import { ScrollTop } from '@/components/scroll-top';

export type GuideSection = {
  id: string; title: string; icon: React.ElementType; from: string; to: string;
  goal: string; steps: string[];
};

/** Shared rich guide renderer: gradient header, index, and per-section goal + numbered steps. */
export function GuideView({
  topId, headerIcon: HeaderIcon, title, subtitle, grad = 'from-primary to-[#1b4f8a]', sections, children,
}: {
  topId: string; headerIcon: React.ElementType; title: string; subtitle: string; grad?: string;
  sections: GuideSection[]; children?: React.ReactNode;
}) {
  return (
    <div id={topId} className="space-y-5 scroll-mt-20">
      <ScrollTop targetId={topId} />

      {/* header */}
      <div className={`card-3d overflow-hidden rounded-2xl bg-gradient-to-l ${grad} p-5 text-white shadow-lg`}>
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/20"><HeaderIcon className="h-7 w-7" /></span>
          <div>
            <h1 className="text-xl font-extrabold drop-shadow">{title}</h1>
            <p className="text-sm font-bold text-white/85">{subtitle}</p>
          </div>
        </div>
      </div>

      {children}

      {/* index */}
      <div id="guide-index" className="card-3d scroll-mt-20 rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2 font-extrabold text-primary"><ListChecks className="h-5 w-5" /> الفهرس — اضغط للانتقال</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sections.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} className="flex items-center gap-2 rounded-xl border-2 border-primary/15 bg-white px-3 py-2.5 text-sm font-bold text-primary transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ backgroundImage: `linear-gradient(135deg, ${s.from}, ${s.to})` }}><s.icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{i + 1}. {s.title}</span>
            </a>
          ))}
        </div>
      </div>

      {/* sections */}
      {sections.map((s, i) => (
        <section key={s.id} id={s.id} className="card-3d scroll-mt-20 overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between gap-3 p-4 text-white" style={{ backgroundImage: `linear-gradient(135deg, ${s.from}, ${s.to})` }}>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/20 shadow-inner ring-1 ring-white/30"><s.icon className="h-7 w-7" /></span>
              <h2 className="text-lg font-extrabold drop-shadow">{i + 1}. {s.title}</h2>
            </div>
            <a href="#guide-index" className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold hover:bg-white/30" title="العودة للفهرس">
              <ArrowUp className="h-4 w-4" /> الفهرس
            </a>
          </div>

          <div className="space-y-3 p-4">
            <div className="flex items-start gap-2 rounded-xl bg-primary/5 p-3">
              <Target className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div><div className="text-xs font-extrabold text-primary">الهدف</div><p className="text-sm font-bold text-foreground/90">{s.goal}</p></div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-primary"><ListChecks className="h-4 w-4" /> الإجراء والطريقة</div>
              <ol className="space-y-2">
                {s.steps.map((st, j) => (
                  <li key={j} className="flex items-start gap-2 rounded-lg border border-primary/10 bg-accent/20 p-2.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-white">{j + 1}</span>
                    <span className="text-sm font-bold text-foreground/90">{st}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
