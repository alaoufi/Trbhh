'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Check, ChevronDown, Settings2, Store, UserRound, Repeat2 } from 'lucide-react';
import { switchProfileAction } from '@/app/account/profiles/actions';
import { switchAccountAction } from '@/app/account/actions';

type Item = { id: number; name: string; type: 'personal' | 'store'; avatarUrl: string; color: string | null };
type LinkedItem = { id: number; name: string; hasStore: boolean; storeName: string | null };

export function ProfileSwitcher({ active, profiles, linked = [] }: { active: Item; profiles: Item[]; linked?: LinkedItem[] }) {
  const [open, setOpen] = useState(false);
  const path = usePathname() || '/';
  const multi = profiles.length > 1 || linked.length > 0;
  const color = active.color || '#3287da';
  const btnCls = 'flex max-w-[70vw] items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold';
  const btnStyle = { borderColor: color, background: `${color}1f`, color } as React.CSSProperties;
  const icon = (
    <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full text-[10px] font-extrabold text-white" style={{ background: color }}>
      {active.avatarUrl && !active.avatarUrl.endsWith('.svg')
        ? <img src={active.avatarUrl} alt="" className="h-full w-full object-cover" />
        : (active.name.trim().charAt(0) || (active.type === 'store' ? '🏪' : '؟'))}
    </span>
  );
  // وسم يميّز نوع الهوية: متجر أو حساب
  const kindBadge = (
    <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-extrabold text-white" style={{ background: active.type === 'store' ? '#059669' : '#0284c7' }}>
      {active.type === 'store' ? 'متجر' : 'حساب'}
    </span>
  );

  // هوية واحدة فقط: المؤشّر رابط لصفحة «هوياتي» لإضافة هويات جديدة.
  if (!multi) {
    return (
      <Link href="/account/profiles" className={btnCls} style={btnStyle} aria-label="الهوية الفعّالة — إدارة الهويات">
        {icon}
        {kindBadge}
        <span className="truncate">أنت: {active.name}</span>
        <Settings2 className="h-3.5 w-3.5 opacity-70" />
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={btnCls}
        style={btnStyle}
        aria-label="الهوية الفعّالة"
      >
        {icon}
        {kindBadge}
        <span className="truncate">أنت: {active.name}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-xl border bg-white shadow-xl">
            <div className="border-b px-3 py-2 text-[11px] font-bold text-muted-foreground">اختر الهوية التي تُعلن باسمها:</div>
            <div className="max-h-72 overflow-y-auto">
              {(['personal', 'store'] as const).map((grp) => {
                const items = profiles.filter((p) => p.type === grp);
                if (!items.length) return null;
                return (
                  <div key={grp}>
                    <div className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-extrabold ${grp === 'store' ? 'bg-emerald-50 text-emerald-800' : 'bg-sky-50 text-sky-800'}`}>
                      {grp === 'store' ? <><Store className="h-3.5 w-3.5" /> متاجري</> : <><UserRound className="h-3.5 w-3.5" /> حساباتي في تربح</>}
                    </div>
                    {items.map((p) => {
                      const c = p.color || '#3287da';
                      const isActive = p.id === active.id;
                      return (
                        <form key={p.id} action={switchProfileAction}>
                          <input type="hidden" name="profileId" value={p.id} />
                          <input type="hidden" name="back" value={path} />
                          <button type="submit" disabled={isActive} className={`flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-secondary ${isActive ? 'bg-emerald-50' : ''}`} style={{ borderInlineStart: `4px solid ${c}` }}>
                            <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-extrabold text-white" style={{ background: c }}>
                              {p.avatarUrl && !p.avatarUrl.endsWith('.svg')
                                ? <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
                                : (p.name.trim().charAt(0) || (p.type === 'store' ? '🏪' : '؟'))}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1 font-bold">
                                <span className="shrink-0 rounded px-1 text-[9px] font-extrabold text-white" style={{ background: p.type === 'store' ? '#059669' : '#0284c7' }}>{p.type === 'store' ? 'متجر' : 'حساب'}</span>
                                <span className="truncate">{p.name}</span>
                              </span>
                              <span className="block text-[11px] text-muted-foreground">{p.type === 'store' ? `🏬 مسجّلة في: متجر «${p.name}» — مستقلّة · الرقم الداخلي #${p.id}` : `🟢 مسجّلة في: تربح (إعلانات عامة) · الرقم الداخلي #${p.id}`}</span>
                            </span>
                            {isActive && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {linked.length > 0 && (
              <div className="border-t">
                <div className="flex items-center gap-1 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-800"><Repeat2 className="h-3.5 w-3.5" /> التبديل لحساب آخر (دخول مستقل)</div>
                {linked.map((a) => (
                  <form key={a.id} action={switchAccountAction} onSubmit={() => setOpen(false)}>
                    <input type="hidden" name="userId" value={a.id} />
                    <button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-right text-sm hover:bg-secondary">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
                        {a.hasStore ? <Store className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{a.name}</span>
                        <span className="block text-[11px] text-muted-foreground">{a.hasStore && a.storeName ? `متجر: ${a.storeName}` : 'حساب مرتبط'}</span>
                      </span>
                    </button>
                  </form>
                ))}
              </div>
            )}
            <Link href="/account/profiles" onClick={() => setOpen(false)} className="flex items-center gap-1.5 border-t bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10">
              <Settings2 className="h-3.5 w-3.5" /> إدارة الهويات والحسابات
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
