'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu, X, ChevronDown, Home, User, Heart, Megaphone, MessagesSquare,
  Building2, Search, Shield, LogIn, LogOut, Share2, PlusCircle, Mail, HelpCircle, FileText, Phone, Sparkles, Crown, BookOpen, Wallet, Info, Store, Clapperboard, MapPin, Bell, Flame, Gavel, Palette, UserPen, ShieldCheck, Users,
} from 'lucide-react';
import { ThemePicker } from '@/components/theme-picker';
import { DesignPicker } from '@/components/design-picker';
import { ADMIN_GROUPS } from '@/components/admin-nav-def';
import { TUTORIALS } from '@/components/tutorials-def';
import { switchAccountAction } from '@/app/account/actions';

function Item({ href, icon: Icon, children, onClick }: { href: string; icon: React.ElementType; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground hover:bg-accent">
      <Icon className="h-5 w-5 shrink-0 text-primary" />
      <span>{children}</span>
    </Link>
  );
}

/** قسم قابل للطي — المتشابهات في قائمة فرعية واحدة، بمظهر سلس يندمج مع بقية القائمة */
function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground hover:bg-accent"
      >
        <span className="flex items-center gap-3"><Icon className="h-5 w-5 shrink-0 text-primary" /> {title}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mr-2 space-y-0.5 border-r-2 border-border py-0.5 pr-2">{children}</div>}
    </div>
  );
}

type LinkedAcct = { id: number; name: string; hasStore: boolean; storeName: string | null; isAdmin: boolean };
export function SiteMenu({ isAuthed, isAdmin, adminHrefs = [], dealsOn = false, auctionsOn = false, debatesOn = true, myStoreId = 0, myStoreName = '', currentUid = 0, activeName = '', activeType = 'personal', linkedAccounts = [] }: { isAuthed: boolean; isAdmin: boolean; adminHrefs?: string[]; dealsOn?: boolean; auctionsOn?: boolean; debatesOn?: boolean; myStoreId?: number; myStoreName?: string; currentUid?: number; activeName?: string; activeType?: 'personal' | 'store'; linkedAccounts?: LinkedAcct[] }) {
  const [open, setOpen] = useState(false);
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
            {/* 🎭 مبدّل الهوية — اختياري: يظهر لمن له صفة إضافية (متجر/إدارة) أو حسابات مرتبطة.
                يعرض صفات الحساب الحالي (عضو/متجر/إدارة) + التبديل للحسابات المرتبطة بنفس المالك. */}
            {isAuthed && (myStoreId > 0 || isAdmin || linkedAccounts.length > 1) && (
              <div className="mb-2 rounded-xl border-2 border-primary/20 bg-primary/5 p-2">
                <div className="mb-1.5 px-1 text-[11px] font-extrabold text-primary">🎭 هوياتي</div>
                {/* الحساب الحالي وصفاته — شارات فقط، بلا روابط مكرّرة مع القائمة (حسابي/لوحة الإدارة لهما مكانهما أدناه) */}
                <div className="flex items-center justify-between gap-2 rounded-lg bg-background px-2 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-foreground">
                    {activeType === 'store' ? <Store className="h-4 w-4 shrink-0 text-emerald-600" /> : <User className="h-4 w-4 shrink-0 text-primary" />}
                    <span className="min-w-0 leading-tight">
                      <span className="block text-[10px] font-normal leading-none text-muted-foreground">أنت الآن</span>
                      <span className="line-clamp-1">{activeName || 'حسابي'}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white" style={{ background: activeType === 'store' ? '#059669' : '#0284c7' }}>{activeType === 'store' ? 'متجر' : 'حساب'}</span>
                    {isAdmin && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">إدارة</span>}
                  </span>
                </div>
                {myStoreId > 0 && (
                  <Link href="/store" onClick={close} className="mt-0.5 flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm font-bold text-foreground hover:bg-accent">
                    <span className="flex min-w-0 items-center gap-2"><Store className="h-4 w-4 shrink-0 text-primary" /> <span className="line-clamp-1">واجهة «{myStoreName || 'متجري'}»</span></span>
                    <span className="shrink-0 text-[11px] text-primary">عرض ←</span>
                  </Link>
                )}
                {myStoreId > 0 && (
                  <Link href="/ads/new?dest=store" onClick={close} className="mt-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold text-primary hover:bg-accent">
                    <PlusCircle className="h-4 w-4 shrink-0" /> <span>أنشر باسم متجري</span>
                  </Link>
                )}
                {/* 🔗 التبديل لحساب آخر مرتبط بنفس المالك (دخول واحد) */}
                {linkedAccounts.filter((a) => a.id !== currentUid).length > 0 && (
                  <div className="mt-1.5 border-t border-primary/15 pt-1.5">
                    <div className="mb-1 px-1 text-[10px] font-extrabold text-muted-foreground">🔗 التبديل لحساب آخر</div>
                    {linkedAccounts.filter((a) => a.id !== currentUid).map((a) => (
                      <form key={a.id} action={switchAccountAction} onSubmit={close}>
                        <input type="hidden" name="userId" value={a.id} />
                        <button type="submit" className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm font-bold text-foreground hover:bg-accent">
                          <span className="flex items-center gap-2"><User className="h-4 w-4 shrink-0 text-primary" /> <span className="line-clamp-1">{a.name}</span></span>
                          <span className="flex shrink-0 items-center gap-1">
                            {a.hasStore && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">متجر</span>}
                            {a.isAdmin && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">إدارة</span>}
                            <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-white">تبديل</span>
                          </span>
                        </button>
                      </form>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* أهم الروابط أولاً */}
            <Item href="/" icon={Home} onClick={close}>الرئيسية</Item>
            <Item href="/companies" icon={Store} onClick={close}>المتاجر</Item>
            {isAuthed && (
              <Link href="/account/profiles" onClick={close} className="mb-1 flex items-center gap-3 rounded-lg border-2 border-violet-400/40 bg-violet-500/15 px-3 py-3 text-[15px] font-extrabold text-violet-700 hover:bg-violet-500/25">
                <Users className="h-5 w-5 shrink-0" /> <span>الحسابات الموحدة</span>
              </Link>
            )}
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
                <Item href="/account/profiles" icon={Users} onClick={close}>الحسابات الموحدة</Item>
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
      <button onClick={() => setOpen(true)} aria-label="القائمة" className="flex items-center gap-0.5 text-[#f0b429]">
        <Menu className="h-7 w-7" />
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {mounted && createPortal(drawer, document.body)}
    </>
  );
}
