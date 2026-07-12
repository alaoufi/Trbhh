'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/**
 * زر إرسال بتأكيد: يفتح نافذة تأكيد مصممة (بدل نافذة المتصفح) قبل تنفيذ
 * الإجراء الخطر (حذف/حظر/خصم رصيد/موافقة…). «موافق» ينفّذ، و«إلغاء» يوقف تماماً.
 */
export function ConfirmSubmit({ msg, className, title, style, name, value, disabled, children }: { msg: string; className?: string; title?: string; style?: CSSProperties; name?: string; value?: string; disabled?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // إغلاق بمفتاح Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const confirm = () => {
    setOpen(false);
    const btn = btnRef.current;
    // requestSubmit مع الزر الأصلي يحافظ على name/value الخاصين به في النموذج
    btn?.form?.requestSubmit(btn);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="submit"
        title={title}
        className={className}
        style={style}
        name={name}
        value={value}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl border-2 border-primary/20 bg-card text-start shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-primary/10 bg-primary/5 px-4 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-100 text-lg">⚠️</span>
              <span className="text-sm font-extrabold text-primary">تأكيد الإجراء</span>
            </div>
            <p className="whitespace-pre-line px-4 py-4 text-sm font-bold leading-7 text-foreground/90">{msg}</p>
            <div className="flex gap-2 border-t border-primary/10 bg-secondary/30 p-3">
              <button
                type="button"
                onClick={confirm}
                className="btn-3d flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground hover:bg-primary/90"
              >
                موافق
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border-2 border-primary/25 bg-card px-4 py-2.5 text-sm font-extrabold text-muted-foreground hover:bg-secondary"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
