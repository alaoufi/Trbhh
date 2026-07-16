import Link from 'next/link';
import { SITE } from '@/lib/constants';
import { DisclaimerBar } from '@/components/disclaimer';

export function Footer({ debatesOn = true }: { debatesOn?: boolean }) {
  return (
    <footer className="mt-12 border-t border-black/20 bg-[#16294a] text-white">
      <div className="container py-10">
        <DisclaimerBar variant="full" className="mb-8" />
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f0b429] font-bold text-[#16294a]">ت</span>
              <span className="text-lg font-bold">{SITE.name}</span>
            </div>
            <p className="text-sm text-white/70">{SITE.tagline}</p>
          </div>
          <div>
            <h4 className="mb-3 font-extrabold text-[#f0b429]">روابط مهمة</h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li><Link href="/" className="hover:text-[#f0b429]">الرئيسية</Link></li>
              <li><Link href="/categories" className="hover:text-[#f0b429]">الأقسام</Link></li>
              <li><Link href="/companies" className="hover:text-[#f0b429]">الشركات</Link></li>
              {debatesOn && <li><Link href="/debates" className="hover:text-[#f0b429]">النقاشات</Link></li>}
              <li><Link href="/search" className="hover:text-[#f0b429]">بحث متقدم</Link></li>
              <li><Link href="/pages/privacy" className="hover:text-[#f0b429]">سياسة الخصوصية</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 font-extrabold text-[#f0b429]">الدعم</h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li><Link href="/pages/about" className="hover:text-[#f0b429]">من نحن</Link></li>
              <li><Link href="/pages/faq" className="hover:text-[#f0b429]">الأسئلة الشائعة</Link></li>
              <li><Link href="/pages/terms" className="hover:text-[#f0b429]">شروط الاستخدام</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 font-extrabold text-[#f0b429]">تواصل معنا</h4>
            <p className="text-sm text-white/70" dir="ltr">{SITE.phone}</p>
          </div>
        </div>
        <div className="mt-8 border-t border-white/15 pt-6 text-center text-sm text-white/60">
          جميع الحقوق محفوظة {SITE.name} © 2026
        </div>
      </div>
    </footer>
  );
}
