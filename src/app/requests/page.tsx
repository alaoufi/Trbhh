import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HandCoins, PlusCircle, Megaphone } from 'lucide-react';
import { getRequestAds } from '@/lib/data';
import { AdGrid } from '@/components/ad-card';
import { getSettingBool } from '@/lib/settings';
import { Breadcrumb } from '@/components/breadcrumb';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'سوق الطلبات — يبحث العملاء عن هذه' };

export default async function RequestsPage() {
  const on = await getSettingBool('requests_market_on', true).catch(() => true);
  if (!on) notFound();
  const ads = await getRequestAds();
  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: 'سوق الطلبات' }]} />

      <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4">
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-primary"><HandCoins className="h-6 w-6" /> سوق الطلبات — يبحث العملاء عن هذه</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          هنا ينشر العملاء ما <b>يبحثون عنه</b> ويريدون شراءه أو تنفيذه. <b>أنت بائع أو مزوّد خدمة؟</b> تصفّح الطلبات،
          وقدّم عرضك، وتواصل مباشرةً مع الطالب — التعامل والدفع خارج المنصّة بين الطرفين.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/ads/new" className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-white hover:opacity-90"><PlusCircle className="h-4 w-4" /> اطلب ما تريد (أنشئ طلباً)</Link>
          <Link href="/search" className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-white px-4 py-2 text-sm font-bold text-primary"><Megaphone className="h-4 w-4" /> تصفّح المعروضات</Link>
        </div>
      </div>

      {ads.length === 0
        ? <p className="py-10 text-center text-muted-foreground">لا توجد طلبات نشطة حالياً — كن أول من ينشر طلباً بالضغط على «اطلب ما تريد».</p>
        : <>
            <div className="text-sm font-bold text-muted-foreground">{ads.length} طلب نشط — اضغط أي طلب لتقديم عرضك والتواصل مع الطالب.</div>
            <AdGrid ads={ads} />
          </>}
    </div>
  );
}
