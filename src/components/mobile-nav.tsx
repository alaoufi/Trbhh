'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, PlusCircle, Mail, Building2, MapPin, LogIn, Share2, Users, Phone, MessageCircle, Send, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SITE } from '@/lib/constants';

type NavItem = { href: string; label: string; icon: LucideIcon; primary?: boolean; badge?: boolean };

// زر مشاركة الصفحة الحالية
const shareItem: NavItem = { href: '__share', label: 'مشاركة', icon: Share2 };

// بنود تتطلّب تسجيل الدخول → تظهر فقط للمسجّل. للزائر بنود عامة فقط.
const authedItems: NavItem[] = [
  { href: '/', label: 'الرئيسية', icon: Home },
  { href: '/map', label: 'الخريطة', icon: MapPin },
  { href: '/ads/new', label: 'أضف عقار', icon: PlusCircle, primary: true },
  { href: '/account/profiles', label: 'الحسابات', icon: Users },
  { href: '__contact', label: 'تواصل', icon: Mail },
];
const guestItems: NavItem[] = [
  { href: '/', label: 'الرئيسية', icon: Home },
  { href: '/map', label: 'الخريطة', icon: MapPin },
  { href: '/companies', label: 'المتاجر', icon: Building2 },
  { href: '/login', label: 'الدخول', icon: LogIn, primary: true },
  shareItem,
];

export function MobileNav({ unread = 0, isAuthed = false }: { unread?: number; isAuthed?: boolean }) {
  const path = usePathname();
  const items = isAuthed ? authedItems : guestItems;
  const [contactOpen, setContactOpen] = useState(false);
  const waPhone = SITE.phone.replace(/\D/g, '').replace(/^00/, '');
  const telPhone = '+' + waPhone;
  const contactLinks = [
    { label: 'اتصال هاتفي', href: `tel:${telPhone}`, icon: Phone, cls: 'text-red-600' },
    { label: 'واتساب', href: `https://wa.me/${waPhone}`, icon: MessageCircle, cls: 'text-[#25D366]' },
    { label: 'مراسلة الإدارة', href: '/messages/admin', icon: Send, cls: 'text-primary' },
  ];

  const sharePage = async () => {
    const url = window.location.href;
    const title = document.title;
    try {
      if (navigator.share) await navigator.share({ url, title });
      else {
        await navigator.clipboard.writeText(url);
        alert('تم نسخ رابط الصفحة ✓');
      }
    } catch {
      /* أغلق العضو نافذة المشاركة */
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/20 bg-primary md:hidden">
      <ul className="flex items-stretch justify-around">
        {items.map(({ href, label, icon: Icon, primary, badge }) => {
          const active = path === href;
          const inner = (
            <>
              {primary ? (
                <span className="grid h-9 w-9 -translate-y-1 place-items-center rounded-full bg-[#f0b429] text-[#16294a] shadow-lg">
                  <Icon className="h-5 w-5" />
                </span>
              ) : (
                <span className="relative">
                  <Icon className={cn('h-6 w-6', active ? 'text-[#f0b429]' : 'text-[#f0b429]/70')} />
                  {badge && unread > 0 && (
                    <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </span>
              )}
              <span className={cn(primary && '-translate-y-1')}>{label}</span>
            </>
          );
          return (
            <li key={href} className="relative flex-1">
              {href === '__share' ? (
                <button type="button" onClick={sharePage} className="flex w-full flex-col items-center gap-0.5 py-1.5 text-[11px] text-[#f0b429]">
                  {inner}
                </button>
              ) : href === '__contact' ? (
                <>
                  <button type="button" onClick={() => setContactOpen((v) => !v)} className="flex w-full flex-col items-center gap-0.5 py-1.5 text-[11px] text-[#f0b429]">
                    {inner}
                  </button>
                  {contactOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setContactOpen(false)} />
                      <div className="absolute bottom-full left-0 z-50 mb-2 w-48 rounded-xl border bg-card p-1.5 text-card-foreground shadow-xl">
                        {contactLinks.map((c) => (
                          <a
                            key={c.label}
                            href={c.href}
                            target={c.href.startsWith('http') ? '_blank' : undefined}
                            rel="noopener noreferrer"
                            onClick={() => setContactOpen(false)}
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-secondary"
                          >
                            <c.icon className={cn('h-4 w-4', c.cls)} /> {c.label}
                          </a>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <Link href={href} className="flex flex-col items-center gap-0.5 py-1.5 text-[11px] text-[#f0b429]">
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
