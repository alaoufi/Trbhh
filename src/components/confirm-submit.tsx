'use client';

import type { ReactNode } from 'react';

/**
 * زر إرسال بتأكيد: يعرض رسالة تأكيد قبل تنفيذ الإجراء الخطر (حذف/حظر/تعديل لا يمكن التراجع عنه).
 * يوضع مكان زر الإرسال داخل أي <form action={...}> — الإلغاء يوقف الإرسال تماماً.
 */
export function ConfirmSubmit({ msg, className, title, children }: { msg: string; className?: string; title?: string; children: ReactNode }) {
  return (
    <button
      type="submit"
      title={title}
      className={className}
      onClick={(e) => {
        if (!window.confirm(msg)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
