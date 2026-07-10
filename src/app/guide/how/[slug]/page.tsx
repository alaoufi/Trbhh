import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clapperboard } from 'lucide-react';
import { TUTORIALS } from '@/components/tutorials-def';
import { TopupTutorial, AddAdTutorial, OpenStoreTutorial, VerifyTutorial, FeatureAdTutorial, AdBoostTutorial } from '@/components/tutorials';

export const dynamic = 'force-dynamic';

const PLAYERS: Record<string, React.ComponentType> = {
  'add-ad': AddAdTutorial,
  'open-store': OpenStoreTutorial,
  topup: TopupTutorial,
  verify: VerifyTutorial,
  'feature-ad': FeatureAdTutorial,
  'ad-boost': AdBoostTutorial,
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = TUTORIALS.find((x) => x.slug === slug);
  return t ? { title: `شرح ${t.title}`, description: t.desc } : { title: 'الشروحات المتحركة' };
}

export default async function TutorialPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = TUTORIALS.find((x) => x.slug === slug);
  const Player = PLAYERS[slug];
  if (!t || !Player) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="card-3d overflow-hidden rounded-2xl p-5 text-white" style={{ backgroundImage: `linear-gradient(135deg, ${t.from}, ${t.to})` }}>
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/20"><t.icon className="h-7 w-7" /></span>
          <div>
            <h1 className="text-xl font-extrabold drop-shadow">شرح {t.title}</h1>
            <p className="text-sm font-bold text-white/85">مقطع متحرك يشرح الخطوات من الصفر بالصور — يعمل تلقائياً.</p>
          </div>
        </div>
      </div>

      <Player />

      <Link href="/guide/how" className="flex items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-primary">
        <Clapperboard className="h-4 w-4" /> كل الشروحات المتحركة
      </Link>
    </div>
  );
}
