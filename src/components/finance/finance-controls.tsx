'use client';

import { useFormStatus } from 'react-dom';

export function FinanceSubmitButton({ children, disabled = false, className }: { children: React.ReactNode; disabled?: boolean; className?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} className={className} aria-disabled={disabled || pending}>{pending ? 'جارٍ الحفظ…' : children}</button>;
}
