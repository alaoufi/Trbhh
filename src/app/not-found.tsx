// صفحة «غير موجودة» (404) بهوية تربح — تظهر لأي رابط غير صحيح بدل صفحة فارغة.
import Link from 'next/link';
import { Home, Search, Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center px-5">
      <div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="h-1.5 w-full bg-[#f0b429]" />
        <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-header.png" alt="تربح" width={64} height={64} className="h-16 w-16 rounded-2xl object-cover shadow-sm" />
          <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/5 ring-1 ring-primary/15">
            <Compass className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="text-3xl font-black tracking-tight text-primary">٤٠٤</p>
            <h1 className="mt-1 text-lg font-extrabold text-primary">الصفحة غير موجودة</h1>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              الرابط الذي فتحته غير متاح أو تمّ نقله. تأكّد من العنوان، أو ابدأ من الرئيسية.
            </p>
          </div>
          <div className="mt-1 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white">
              <Home className="h-4 w-4" /> الرئيسية
            </Link>
            <Link href="/search" className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/25 px-5 py-2.5 text-sm font-bold text-primary">
              <Search className="h-4 w-4" /> البحث في الإعلانات
            </Link>
          </div>
          <p className="pt-2 text-[11px] text-slate-400">منصة تربح · trbhh.com</p>
        </div>
      </div>
    </div>
  );
}
