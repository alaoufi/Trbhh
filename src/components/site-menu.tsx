'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu, X, ChevronDown, Home, User, Heart, Megaphone, MessagesSquare,
  Building2, Search, Shield, LogIn, LogOut, Share2, PlusCircle, Mail, HelpCircle, FileText, Phone, Sparkles, Crown, BookOpen, Wallet, Info, Store, Clapperboard, MapPin, Bell, Flame, Gavel, Palette, UserPen, ShieldCheck,
} from 'lucide-react';
import { ThemePicker } from '@/components/theme-picker';
import { DesignPicker } from '@/components/design-picker';
import { ADMIN_GROUPS } from '@/components/admin-nav-def';
import { TUTORIALS } from '@/components/tutorials-def';

type Cat = { id: number; name: string };

function Item({ href, icon: Icon, children, onClick }: { href: string; icon: React.ElementType; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground hover:bg-accent">
      <Icon className="h-5 w-5 shrink-0 text-primary" />
      <span>{children}</span>
    </Link>
  );
}

/** قسم قابل للطي — المتشابهات في قائمة فرعية واحدة */
function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-primary/15">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 bg-secondary/40 px-3 py-2.5 text-[15px] font-bold text-primary"
      >
        <span className="flex items-center gap-3"><Icon className="h-5 w-5 shrink-0" /> {title}</span>
        <ChevronDown className={`h-5 w-5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="p-1">{children}</div>}
    </div>
  );
}

export function SiteMenu({ isAuthed, isAdmin, categories, adminHrefs = [], dealsOn = false, auctionsOn = false, debatesOn = true, myStoreId = 0, myStoreName = '' }: { isAuthed: boolean; isAdmin: boolean; categories: Cat[]; adminHrefs?: string[]; dealsOn?: boolean; auctionsOn?: boolean; debatesOn?: boolean; myStoreId?: number; myStoreName?: string }) {
  const [open, setOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname() || '';
  useEffect(() => setMounted(true), []);

  // lock body scroll while the drawer is open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  const cats = categories ?? [];
  const close = () => setOpen(false);

  // داخل لوحة الإدارة: القائمة = قائمة الإدارة (المصرّح بها فقط) بدل قائمة الموقع
  const adminMode = isAdmin && pathname.startsWith('/admin');
  const adminGroups = adminMode
    ? ADMIN_GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => adminHrefs.includes(n.href)) })).filter((g) => g.items.length > 0)
    : [];

  async function share() {
    const url = typeof window !== 'undefined' ? window.location.origin : '';
    if (navigator.share) { try { await navigator.share({ title: 'تربح', url }); } catch { /* cancelled */ } return; }
    let ok = false;
    try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); ok = true; } } catch { /* fall through */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { /* ignore */ }
    }
    if (ok) alert('تم نسخ الرابط');
  }

  const drawer = open ? (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <nav className="absolute inset-y-0 right-0 flex w-80 max-w-[85%] flex-col overflow-y-auto bg-card text-card-foreground shadow-2xl">
        <div className="flex items-center justify-between border-b border-primary/15 bg-accent/60 p-4">
          <span className="text-lg font-bold text-primary">{adminMode ? 'قائمة الإدارة' : 'القائمة'}</span>
          <button onClick={close} aria-label="إغلاق" className="text-primary"><X className="h-6 w-6" /></button>
        </div>

        {adminMode ? (
          /* ===== قائمة الإدارة داخل اللوحة — مجموعات ملوّنة قابلة للطي ===== */
          <div className="flex-1 space-y-1.5 p-2">
            {adminGroups.map((g) =>
              g.key === 'top' ? (
                g.items.map((n) => <Item key={n.href} href={n.href} icon={n.icon} onClick={close}>{n.label}</Item>)
              ) : (
                <details key={g.key} open={g.items.some((n) => pathname === n.href || pathname.startsWith(n.href + '/'))} className="overflow-hidden rounded-lg border" style={{ borderColor: `${g.color}40` }}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[15px] font-extrabold text-white" style={{ background: g.color }}>
                    <span className="flex items-center gap-3"><g.icon className="h-5 w-5" /> {g.title}</span>
                    <ChevronDown className="h-5 w-5 opacity-80" />
                  </summary>
                  <div className="space-y-0.5 p-1" style={{ background: `${g.color}0d` }}>
                    {g.items.map((n) => (
                      <Link key={n.href} href={n.href} onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium hover:bg-white/70" style={{ color: g.color }}>
                        <n.icon className="h-5 w-5 shrink-0" /> <span>{n.label}</span>
                      </Link>
                    ))}
                  </div>
                </details>
              ),
            )}
            <div className="my-2 border-t border-primary/10" />
            <Item href="/" icon={Home} onClick={close}>العودة للموقع</Item>
          </div>
        ) : (
          <div className="flex-1 p-2">
            {/* 🎭 مبدّل الهوية — اختياري: يظهر فقط لأصحاب المتاجر لعزل النشاط بين هوياتهم */}
            {isAuthed && myStoreId > 0 && (
              <div className="mb-2 rounded-xl border-2 border-primary/20 bg-primary/5 p-2">
                <div className="mb-1.5 px-1 text-[11px] font-extrabold text-primary">🎭 هوياتي</div>
                <Link href="/account" onClick={close} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-bold text-foreground hover:bg-accent">
                  <User className="h-4 w-4 shrink-0 text-primary" /> <span>👤 حسابي الشخصي</span>
                </Link>
                <Link href="/store" onClick={close} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-bold text-foreground hover:bg-accent">
                  <Store className="h-4 w-4 shrink-0 text-primary" /> <span className="line-clamp-1">🏬 متجر «{myStoreName || 'متجري'}»</span>
                </Link>
                <Link href="/ads/new?dest=store" onClick={close} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold text-primary hover:bg-accent">
                  <PlusCircle className="h-4 w-4 shrink-0" /> <span>أنشر باسم متجري</span>
                </Link>
              </div>
            )}
            {/* أهم الروابط أولاً */}
            <Item href="/" icon={Home} onClick={close}>الرئيسية</Item>
            <Item href="/companies" icon={Store} onClick={close}>المتاجر</Item>
            {isAdmin && (
              <Link href="/admin" onClick={close} className="mb-1 flex items-center gap-3 rounded-lg bg-amber-500/15 px-3 py-3 text-[15px] font-extrabold text-amber-700 hover:bg-amber-500/25">
                <Shield className="h-5 w-5 shrink-0" /> <span>لوحة الإدارة</span>
              </Link>
            )}
            <Link href="/guide" onClick={close} className="mb-1 flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-3 text-[15px] font-extrabold text-primary hover:bg-primary/15">
              <BookOpen className="h-5 w-5 shrink-0" /> <span>دليل المستخدم</span>
            </Link>

            {/* الشروحات المتحركة — مقاطع تشرح كل خطوة بالصور */}
            <Section title="شروحات متحركة" icon={Clapperboard}>
              <Item href="/guide/how" icon={Clapperboard} onClick={close}>كل الشروحات</Item>
              {TUTORIALS.map((t) => (
                <Item key={t.slug} href={`/guide/how/${t.slug}`} icon={t.icon} onClick={close}>{t.title}</Item>
              ))}
            </Section>

            {/* المتشابهات في قوائم فرعية */}
            {isAuthed && (
              <Section title="حسابي" icon={User}>
                <Item href="/account" icon={User} onClick={close}>لوحة حسابي</Item>
                <Item href="/account/profile" icon={UserPen} onClick={close}>الملف الشخصي</Item>
                <Item href="/account/verify" icon={ShieldCheck} onClick={close}>توثيق الحساب</Item>
                <Item href="/messages" icon={Mail} onClick={close}>رسائلي</Item>
                <Item href="/notifications" icon={Bell} onClick={close}>التنبيهات</Item>
                <Item href="/account/wallet" icon={Wallet} onClick={close}>محفظتي</Item>
                <Item href="/account/ads" icon={Megaphone} onClick={close}>إعلاناتي</Item>
                <Item href="/account/favorites" icon={Heart} onClick={close}>المفضلة</Item>
                <Item href="/account/classified" icon={Sparkles} onClick={close}>إعلاناتي المبوّبة</Item>
                <Item href="/account/promos" icon={Megaphone} onClick={close}>إعلاناتي الترويجية</Item>
                <Item href="/account/company" icon={Building2} onClick={close}>متجري</Item>
              </Section>
            )}

            <Section title="النشر والإعلان" icon={PlusCircle}>
              {isAuthed && <Item href="/ads/new" icon={PlusCircle} onClick={close}>أضف إعلان</Item>}
              {isAuthed && <Item href="/classified/new" icon={Sparkles} onClick={close}>المصمم الذكي (إعلان مبوّب)</Item>}
              <Item href="/promote" icon={Megaphone} onClick={close}>أعلن معنا</Item>
              <Item href="/packages" icon={Crown} onClick={close}>الباقات</Item>
            </Section>

            <Section title="تصفّح" icon={Search}>
              <Item href="/search" icon={Search} onClick={close}>بحث متقدم</Item>
              {dealsOn && <Item href="/deals" icon={Flame} onClick={close}>🔥 عروض اليوم</Item>}
              {auctionsOn && <Item href="/auctions" icon={Gavel} onClick={close}>🔨 المزادات</Item>}
              <Item href="/nearby" icon={MapPin} onClick={close}>قريب منك</Item>
              <Item href="/classified" icon={Sparkles} onClick={close}>الإعلانات المبوّبة</Item>
              {debatesOn && <Item href="/debates" icon={MessagesSquare} onClick={close}>المناقشات</Item>}
              {/* الأقسام (تصفّح حسب القسم) — تختفي كلياً عند إخفائها من التحكم */}
              {cats.length > 0 && (
              <>
              <button
                onClick={() => setCatOpen((v) => !v)}
                className="mt-1 flex w-full items-center justify-between rounded-lg bg-primary px-3 py-2.5 text-[15px] font-bold text-white"
              >
                <span>الأقسام</span>
                <ChevronDown className={`h-5 w-5 transition-transform ${catOpen ? 'rotate-180' : ''}`} />
              </button>
              {catOpen && cats.length > 0 && (
                <div className="mb-1 mt-1 max-h-64 overflow-y-auto rounded-lg border border-primary/15">
                  {cats.map((c) => (
                    <Link key={c.id} href={`/categories/${c.id}`} onClick={close} className="block px-4 py-2.5 text-sm hover:bg-accent">
                      {c.name}
                    </Link>
                  ))}
                </div>
              )}
              </>
              )}
            </Section>

            <Section title="التواصل" icon={Mail}>
              {isAuthed && <Item href="/messages" icon={Mail} onClick={close}>مراسلات الإدارة</Item>}
              <Item href="/pages/contact" icon={Phone} onClick={close}>تواصل معنا</Item>
              <button onClick={share} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium text-primary hover:bg-accent">
                <Share2 className="h-5 w-5 shrink-0" /> مشاركة الموقع
              </button>
            </Section>

            <Section title="معلومات" icon={Info}>
              <Item href="/pages/about" icon={Building2} onClick={close}>من نحن</Item>
              <Item href="/pages/faq" icon={HelpCircle} onClick={close}>الأسئلة الشائعة</Item>
              <Item href="/pages/privacy" icon={Shield} onClick={close}>سياسة الخصوصية</Item>
              <Item href="/pages/terms" icon={FileText} onClick={close}>الشروط والأحكام</Item>
            </Section>

            {/* الألوان والقوالب — تفضيل شخصي يُحفظ على جهاز المستخدم (متاح للجميع) */}
            <Section title="الألوان والقوالب 🎨" icon={Palette}>
              <ThemePicker />
              <DesignPicker />
            </Section>
          </div>
        )}

        <div className="border-t border-primary/15 p-3">
          {isAuthed ? (
            <a href="/logout" className="flex items-center justify-center gap-2 rounded-lg border border-destructive/30 px-3 py-2.5 text-sm font-medium text-destructive">
              <LogOut className="h-4 w-4" /> تسجيل الخروج
            </a>
          ) : (
            <Link href="/login" onClick={close} className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-white">
              <LogIn className="h-4 w-4" /> تسجيل الدخول
            </Link>
          )}
        </div>
      </nav>
    </div>
  ) : null;

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="القائمة" className="text-primary">
        <Menu className="h-7 w-7" />
      </button>
      {mounted && createPortal(drawer, document.body)}
    </>
  );
}
