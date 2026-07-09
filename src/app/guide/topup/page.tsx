import Link from 'next/link';
import { HandCoins, BookOpen } from 'lucide-react';
import { TopupTutorial } from '@/components/topup-tutorial';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'شرح شحن الرصيد',
  description: 'شرح متحرك خطوة بخطوة: كيف تشحن رصيدك في منصة تربح من الصفر حتى إضافة المبلغ.',
};

export default function TopupGuidePage() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="card-3d overflow-hidden rounded-2xl p-5 text-white" style={{ backgroundImage: 'linear-gradient(135deg, #0ea5e9, #166534)' }}>
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/20"><HandCoins className="h-7 w-7" /></span>
          <div>
            <h1 className="text-xl font-extrabold drop-shadow">شرح شحن الرصيد</h1>
            <p className="text-sm font-bold text-white/85">مقطع متحرك يشرح الخطوات من الصفر بالصور — يعمل تلقائياً.</p>
          </div>
        </div>
      </div>

      <TopupTutorial />

      <Link href="/guide" className="flex items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-primary">
        <BookOpen className="h-4 w-4" /> دليل المستخدم الكامل
      </Link>
    </div>
  );
}
