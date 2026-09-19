'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { NewAdPage, SellerDashboard } from '../../preview-v2/components/preview-local-seller';
import { FieldSettingsPreview } from '../../preview-v2/components/field-settings-preview';
import { installPreviewStorage } from '../../preview-v2/lib/preview';
import { createPreviewServerStorage, PreviewStorageError, type StorageStatus } from '../../preview-v2/lib/preview-server-storage';
import './preview-local-seller.css';

function LocalPreview({ children, server = false }: { children: ReactNode; server?: boolean }) {
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const show = (event: Event) => setNotice(String((event as CustomEvent).detail || ''));
    window.addEventListener('trbhh-notice', show);
    return () => window.removeEventListener('trbhh-notice', show);
  }, []);
  return <div className="preview-local" dir="rtl">
    <p className="preview-local-notice">{server ? 'تجربة معزولة: اضغط حفظ لحفظ الإعلانات والمسودات في حسابك على خادم التجربة. لا تغيير للموقع الفعلي ولا دفع.' : 'تجربة محلية: الإعلانات والمسودات محفوظة في هذا المتصفح فقط. لا نشر عام ولا دفع.'}</p>
    <p role="status" aria-live="polite">{notice}</p>
    {children}
  </div>;
}
export function PreviewLocalNewAd() { return <LocalPreview><NewAdPage /></LocalPreview>; }
export function PreviewLocalSeller() { return <LocalPreview><SellerDashboard /></LocalPreview>; }

// Mount children only after the authenticated server snapshot is installed.
// On write failures keep the form mounted so unsaved input is not discarded.
export function PreviewServerStorageProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<StorageStatus>({pending:0,error:null});
  const [login, setLogin] = useState('/preview-login');
  useEffect(() => {
    let cancelled = false;
    let uninstall: (() => void) | undefined;
    const storage = createPreviewServerStorage();
    const unsubscribe = storage.subscribe(setStatus);
    setLogin('/preview-login?next=' + encodeURIComponent(window.location.pathname + window.location.search));
    storage.hydrate().then(() => {
      if (cancelled) return;
      uninstall = installPreviewStorage(storage);
      setReady(true);
    }).catch(error => {
      if (!cancelled) setStatus({pending:0,error:error instanceof PreviewStorageError ? error : new PreviewStorageError(0,'تعذر تحميل بيانات التجربة. لم نستخدم بيانات المتصفح بديلاً عنها.')});
    });
    return () => { cancelled = true; unsubscribe(); uninstall?.(); storage.dispose(); };
  }, [attempt]);
  return <>
    {!ready && !status.error && <p role="status">جارٍ تحميل بيانات حساب التجربة…</p>}
    {status.error && <div role="alert" className="preview-local-server-error">
      <p>{status.error.message}</p>
      {status.error.status === 401 && <a className="button secondary" href={login} target={ready ? '_blank' : undefined} rel="noopener noreferrer">تسجيل الدخول</a>}
      {!ready && <button type="button" className="button secondary" onClick={() => {setStatus({pending:0,error:null});setAttempt(value=>value+1);}}>إعادة محاولة التحميل</button>}
      {ready && status.error.status === 409 && <p>لن نكتب فوق التغييرات الأحدث. انسخ تعديلاتك قبل إعادة تحميل الصفحة.</p>}
    </div>}
    {status.pending > 0 && <p role="status">جارٍ الحفظ على خادم التجربة…</p>}
    {ready && children}
  </>;
}
export function PreviewSandboxNewAd() {
  return <LocalPreview server><PreviewServerStorageProvider><NewAdPage storageMode="server" /></PreviewServerStorageProvider></LocalPreview>;
}
export function PreviewSandboxSeller() {
  return <LocalPreview server><PreviewServerStorageProvider><SellerDashboard storageMode="server" /></PreviewServerStorageProvider></LocalPreview>;
}
export function PreviewSandboxFields() {
  return <LocalPreview server><PreviewServerStorageProvider><FieldSettingsPreview storageMode="server" /></PreviewServerStorageProvider></LocalPreview>;
}
