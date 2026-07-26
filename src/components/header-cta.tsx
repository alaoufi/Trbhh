'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Store, LogIn, Home } from 'lucide-react';

// flex-1 (بلا min-w-0/overflow) + whitespace-nowrap: يتمدّد لملء الفراغ ويدفع الشعار
// لأقصى اليسار، لكنه لا يتقلّص تحت عرض نصه فلا يُقصّ «الدخول» أبداً (min-width:auto).
const cls = 'flex h-11 flex-1 items-center justify-start gap-2 px-2 text-sm font-extrabold whitespace-nowrap text-[#f0b429] transition hover:text-[#ffd166]';

/**
 * زر الهيدر الرئيسي — يتغيّر حسب الصفحة (عميل، ليتفاعل مع التنقّل الفوري):
 * - في صفحة الدخول: «الصفحة الرئيسية» (لا داعي لزر دخول مكرّر).
 * - للزائر: «تسجيل الدخول». - لصاحب المتجر: «رابط المتجر». - غير ذلك: فراغ.
 */
export function HeaderCta({ isAuthed, myStoreId }: { isAuthed: boolean; myStoreId: number }) {
  const pathname = usePathname() || '';
  if (pathname.startsWith('/login')) {
    return <Link href="/" className={`${cls} !text-xs`}><Home className="h-4 w-4 shrink-0" /> <span>الرئيسية</span></Link>;
  }
  if (!isAuthed) {
    return <Link href="/login" className={cls}><LogIn className="h-5 w-5 shrink-0" /> <span>الدخول</span></Link>;
  }
  if (myStoreId > 0) {
    return <Link href={`/companies/${myStoreId}`} className={cls}><Store className="h-5 w-5 shrink-0" /> <span>رابط المتجر</span></Link>;
  }
  return <div className="flex-1" />;
}
