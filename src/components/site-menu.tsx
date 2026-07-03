'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Menu, X, ChevronDown, Home, User, Heart, Megaphone, MessagesSquare,
  Building2, Search, Shield, LogIn, LogOut, Share2, PlusCircle, Mail, HelpCircle, FileText, Phone, Sparkles, Crown, BookOpen,
} from 'lucide-react';
import { SITE } from '@/lib/constants';
import { ThemePicker } from '@/components/theme-picker';

type Cat = { id: number; name: string };

function Item({ href, icon: Icon, children, onClick }: { href: string; icon: React.ElementType; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground hover:bg-accent">
      <Icon className="h-5 w-5 shrink-0 text-primary" />
      <span>{children}</span>
    </Link>
  );
}

function Group({ label }: { label: string }) {
  return <div className="mb-1 mt-3 px-3 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{label}</div>;
}

export function SiteMenu({ isAuthed, isAdmin, categories }: { isAuthed: boolean; isAdmin: boolean; categories: Cat[] }) {
  const [open, setOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
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

  async function share() {
    const url = typeof window !== 'undefined' ? window.location.origin : '';
    try {
      if (navigator.share) await navigator.share({ title: 'تربح', url });
      else { await navigator.clipboard.writeText(url); alert('تم نسخ الرابط'); }
    } catch { /* cancelled */ }
  }

  const drawer = open ? (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <nav className="absolute inset-y-0 right-0 flex w-80 max-w-[85%] flex-col overflow-y-auto bg-card text-card-foreground shadow-2xl">
        <div className="flex items-center justify-between border-b border-primary/15 bg-accent/60 p-4">
          <span className="text-lg font-bold text-primary">القائمة</span>
          <button onClick={close} aria-label="إغلاق" className="text-primary"><X className="h-6 w-6" /></button>
        </div>

        <div className="flex-1 p-2">
          <Item href="/" icon={Home} onClick={close}>الرئيسية</Item>
          <Link href="/guide" onClick={close} className="mb-1 flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-3 text-[15px] font-extrabold text-primary hover:bg-primary/15">
            <BookOpen className="h-5 w-5 shrink-0" /> <span>دليل الاستخدام</span>
          </Link>

          <Group label="حسابي" />
          <Item href={isAuthed ? '/account' : '/login'} icon={User} onClick={close}>حسابي</Item>
          <Item href="/account/ads" icon={Megaphone} onClick={close}>إعلاناتي</Item>
          <Item href="/account/favorites" icon={Heart} onClick={close}>المفضلة</Item>
          {isAuthed && <Item href="/account/classified" icon={Sparkles} onClick={close}>إعلاناتي المبوّبة</Item>}
          {isAuthed && <Item href="/account/promos" icon={Megaphone} onClick={close}>إعلاناتي الترويجية</Item>}

          <Group label="النشر والإعلان" />
          <Item href="/ads/new" icon={PlusCircle} onClick={close}>أضف إعلان</Item>
          <Item href="/classified/new" icon={Sparkles} onClick={close}>المصمم الذكي (إعلان مبوّب)</Item>
          <Item href="/promote" icon={Megaphone} onClick={close}>أعلن معنا</Item>
          <Item href="/packages" icon={Crown} onClick={close}>الباقات</Item>

          <Group label="تصفّح" />
          <Item href="/search" icon={Search} onClick={close}>بحث متقدم</Item>
          <Item href="/classified" icon={Sparkles} onClick={close}>الإعلانات المبوّبة</Item>
          <Item href="/companies" icon={Building2} onClick={close}>الشركات</Item>
          <Item href="/debates" icon={MessagesSquare} onClick={close}>المناقشات</Item>
          {/* الأقسام (تصفّح حسب القسم) */}
          <button
            onClick={() => setCatOpen((v) => !v)}
            className="mt-1 flex w-full items-center justify-between rounded-lg bg-primary px-3 py-3 text-[15px] font-bold text-white"
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

          <Group label="التواصل" />
          {isAuthed && <Item href="/messages" icon={Mail} onClick={close}>مراسلات الإدارة</Item>}
          <a href={`tel:${SITE.phone}`} onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium text-foreground hover:bg-accent">
            <Phone className="h-5 w-5 shrink-0 text-primary" /> <span>تواصل معنا</span>
          </a>
          <button onClick={share} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium text-primary hover:bg-accent">
            <Share2 className="h-5 w-5 shrink-0" /> مشاركة الموقع
          </button>

          <div className="my-2 border-t border-primary/10" />
          <ThemePicker />
          <div className="my-2 border-t border-primary/10" />

          <Group label="معلومات" />
          <Item href="/pages/about" icon={Building2} onClick={close}>من نحن</Item>
          <Item href="/pages/faq" icon={HelpCircle} onClick={close}>الأسئلة الشائعة</Item>
          <Item href="/pages/privacy" icon={Shield} onClick={close}>سياسة الخصوصية</Item>
          <Item href="/pages/terms" icon={FileText} onClick={close}>الشروط والأحكام</Item>
          {isAdmin && <Item href="/admin" icon={Shield} onClick={close}>لوحة الإدارة</Item>}
        </div>

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
