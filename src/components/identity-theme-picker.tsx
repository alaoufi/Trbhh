'use client';
import { useRef, useState, useTransition } from 'react';
import { IDENTITY_THEMES } from '@/lib/identity-themes';
import { setProfileThemeAction } from '@/app/account/profiles/actions';

/**
 * منتقي قالب الهوية — تطبيق فوري بمجرد اختيار اللون (بلا زر حفظ):
 *  • يطبّق القالب الكامل على الموقع فوراً بصرياً إن كانت هذه الهوية النشطة (data-theme).
 *  • يحفظه مباشرةً عبر server action دون إرسال النموذج (فلا يُغلق قسم التعديل).
 *  • يبقى حقل مخفي name="theme" داخل النموذج ليحفظ زرّ «حفظ التعديلات» القالب نفسه أيضاً.
 */
export function IdentityThemePicker({ profileId, value, isActive, autosave }: { profileId: number; value: string; isActive: boolean; autosave: boolean }) {
  const [sel, setSel] = useState(value || '');
  const [saved, setSaved] = useState(false);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [, start] = useTransition();

  function pick(key: string) {
    setSel(key);
    if (hiddenRef.current) hiddenRef.current.value = key; // يبقي حقل النموذج متوافقاً مع الاختيار
    // تطبيق فوري بصري على الموقع كاملاً إن كانت هذه الهوية هي النشطة
    if (isActive && typeof document !== 'undefined') {
      const el = document.documentElement;
      if (key) el.setAttribute('data-theme', key);
      else el.removeAttribute('data-theme');
    }
    if (autosave) {
      start(async () => { await setProfileThemeAction(profileId, key); });
      setSaved(true);
    }
  }

  return (
    <div>
      <input ref={hiddenRef} type="hidden" name="theme" defaultValue={value} />
      <div className="flex flex-wrap items-center gap-2">
        {IDENTITY_THEMES.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => pick(t.key)}
            title={t.name}
            aria-pressed={sel === t.key}
            className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ring-2 transition ${sel === t.key ? 'ring-foreground' : 'ring-transparent'}`}
            style={{ borderColor: t.hex, color: t.hex }}
          >
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: t.hex }} /> {t.name}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {autosave
          ? (saved ? '✓ طُبِّق القالب وحُفظ فوراً — لا حاجة لزر حفظ.' : 'اختر القالب — يُطبَّق على الموقع ويُحفظ فوراً بمجرد الاختيار.')
          : 'عند تفعيل هذه الهوية يتغيّر قالب الموقع بالكامل للونها لتعرف بأي هوية تعمل.'}
      </p>
    </div>
  );
}
