'use client';
import { Component, type ReactNode } from 'react';
import { reportClientErrorAction } from '@/app/error-actions';

/**
 * حدّ خطأ دقيق يعزل انهيار عنصر واحد (بطاقة إعلان مثلاً) حتى لا يُسقط الصفحة كلها.
 * عند فشل تصيير الأبناء يُعرض البديل (أو لا شيء) بدل شاشة «حدث خطأ غير متوقع» العامة،
 * ويُسجَّل الخطأ. حدّ الخطأ يعمل أثناء التصيير الخادمي (SSR) فيُعزل العنصر على الخادم.
 * الرسالة الحقيقية لأخطاء المكوّنات الخادمية تُلتقط خادمياً عبر onRequestError.
 */
export class SafeRender extends Component<
  { children: ReactNode; fallback?: ReactNode; label?: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error & { digest?: string }) {
    try {
      reportClientErrorAction({
        message: `[safe-render${this.props.label ? ':' + this.props.label : ''}] ${error?.message || 'render error'}`,
        digest: error?.digest,
        stack: error?.stack,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      }).catch(() => {});
    } catch { /* التسجيل لا يكسر العرض */ }
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
