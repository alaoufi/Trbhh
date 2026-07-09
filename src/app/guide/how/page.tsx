import Link from 'next/link';
import { Clapperboard, BookOpen, Play } from 'lucide-react';
import { TUTORIALS } from '@/components/tutorials-def';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'الشروحات المتحركة',
  description: 'مقاطع متحركة تشرح خطوات المنصة من الصفر بالصور: إضافة إعلان، إنشاء متجر، شحن الرصيد، وغيرها.',
};

export default function TutorialsIndexPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="card-3d overflow-hidden rounded-2xl p-5 text-white" style={{ backgroundImage: 'linear-gradient(135deg, #7c3aed, #312e81)' }}>
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/20"><Clapperboard className="h-7 w-7" /></span>
          <div>
            <h1 className="text-xl font-extrabold drop-shadow">الشروحات المتحركة</h1>
            <p className="text-sm font-bold text-white/85">مقاطع تشرح كل خطوة من الصفر بالصور — تعمل تلقائياً وتُشارك برابط.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TUTORIALS.map((t) => (
          <Link key={t.slug} href={`/guide/how/${t.slug}`} className="card-3d group flex items-center gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white shadow" style={{ backgroundImage: `linear-gradient(135deg, ${t.from}, ${t.to})` }}>
              <t.icon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-extrabold text-foreground">{t.title} <Play className="h-3.5 w-3.5 text-primary" /></span>
              <span className="mt-0.5 block text-xs font-medium leading-relaxed text-muted-foreground">{t.desc}</span>
            </span>
          </Link>
        ))}
      </div>

      <Link href="/guide" className="flex items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-primary">
        <BookOpen className="h-4 w-4" /> دليل المستخدم الكامل
      </Link>
    </div>
  );
}
