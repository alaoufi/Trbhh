'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { NewAdPage, SellerDashboard } from '../../preview-v2/components/preview-local-seller';
import './preview-local-seller.css';

function LocalPreview({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const show = (event: Event) => setNotice(String((event as CustomEvent).detail || ''));
    window.addEventListener('trbhh-notice', show);
    return () => window.removeEventListener('trbhh-notice', show);
  }, []);
  return <div className="preview-local" dir="rtl">
    <p className="preview-local-notice">تجربة محلية: الإعلانات والمسودات محفوظة في هذا المتصفح فقط. لا نشر عام ولا دفع.</p>
    <p role="status" aria-live="polite">{notice}</p>
    {children}
  </div>;
}
export function PreviewLocalNewAd() { return <LocalPreview><NewAdPage /></LocalPreview>; }
export function PreviewLocalSeller() { return <LocalPreview><SellerDashboard /></LocalPreview>; }
