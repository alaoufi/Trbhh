'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Check, ChevronDown, Settings2 } from 'lucide-react';
import { switchProfileAction } from '@/app/account/profiles/actions';

type Item = { id: number; name: string; type: 'personal' | 'store'; avatarUrl: string; color: string | null };

export function ProfileSwitcher({ active, profiles }: { active: Item; profiles: Item[] }) {
  const [open, setOpen] = useState(false);
  const path = usePathname() || '/';
  const multi = profiles.length > 1;
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

  // هوية واحدة فقط: المؤشّر رابط لصفحة «هوياتي» لإضافة هويات جديدة.
  if (!multi) {
    return (
      <Link href="/account/profiles" className={btnCls} style={btnStyle} aria-label="الهوية الفعّالة — إدارة الهويات">
        {icon}
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
        <span className="truncate">أنت: {active.name}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-xl border bg-white shadow-xl">
            <div className="border-b px-3 py-2 text-[11px] font-bold text-muted-foreground">اختر الهوية التي تُعلن باسمها:</div>
            <div className="max-h-72 overflow-y-auto">
              {profiles.map((p) => {
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
                        <span className="block truncate font-bold">{p.name}</span>
                        <span className="block text-[11px] text-muted-foreground">{p.type === 'store' ? 'متجر' : 'حساب شخصي'}</span>
                      </span>
                      {isActive && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                    </button>
                  </form>
                );
              })}
            </div>
            <Link href="/account/profiles" onClick={() => setOpen(false)} className="flex items-center gap-1.5 border-t bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10">
              <Settings2 className="h-3.5 w-3.5" /> إدارة الهويات (إضافة/تعديل)
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
