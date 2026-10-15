'use client';

import { useFormStatus } from 'react-dom';

export function FinanceSubmitButton({ children, disabled = false, className, formAction, formNoValidate }: { children: React.ReactNode; disabled?: boolean; className?: string; formAction?:(form:FormData)=>void|Promise<void>; formNoValidate?:boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" formAction={formAction} formNoValidate={formNoValidate} disabled={disabled || pending} className={className} aria-disabled={disabled || pending}>{pending ? 'جارٍ الحفظ…' : children}</button>;
}
