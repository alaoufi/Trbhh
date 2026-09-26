'use client';
import { useFormStatus } from 'react-dom';

/**
 * زرّ إرسال بمؤشّر تحميل: يعرض دوّارة ونصّاً «جارٍ…» أثناء تنفيذ الإجراء (server action)
 * ويُعطّل نفسه ليمنع الضغط المزدوج. رسالة الانتهاء تظهر بعد إعادة التوجيه من الإجراء.
 * يُستعمل داخل <form action={...}> فقط (يعتمد على useFormStatus من نفس النموذج).
 */
export function SubmitButton({
  children, pendingText, className, disabled,
}: { children: React.ReactNode; pendingText?: string; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending} className={`${className ?? ''} inline-flex items-center justify-center gap-2 disabled:opacity-60`}>
      {pending && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
        </svg>
      )}
      <span>{pending ? (pendingText ?? 'جارٍ التنفيذ…') : children}</span>
    </button>
  );
}
