'use client';
export interface PreviewStorageAdapter {
  read<T>(key: string, fallback: T): T;
  write(key: string, value: unknown): Promise<void>;
  dispose?(): void;
}
export type PreviewStorageMode = 'local' | 'server';
let serverStorage: PreviewStorageAdapter | null = null;
let installation: object | null = null;
export function installPreviewStorage(adapter: PreviewStorageAdapter) {
  if (serverStorage) throw new Error('Preview storage is already installed.');
  serverStorage = adapter;
  const token = {}; installation = token;
  return () => {
    if (installation === token) { serverStorage = null; installation = null; adapter.dispose?.(); }
  };
}
// One operation holds one installation, including across multiple awaited writes.
export function capturePreviewStorage(mode?: PreviewStorageMode): Pick<PreviewStorageAdapter, 'write'> {
  const adapter = serverStorage; const token = installation;
  const assertActive = () => {
    if (!adapter || installation !== token) throw new Error('انتهت جلسة التخزين التجريبي. أعد تحميل الصفحة قبل الحفظ.');
  };
  if (mode === 'server' || adapter) {
    assertActive();
    return {async write(key, value) { assertActive(); await adapter!.write(key, value); assertActive(); }};
  }
  return {async write(key, value) {
    const serialized = JSON.stringify(value);
    localStorage.setItem('trbhh-v2-'+key, serialized);
    if (localStorage.getItem('trbhh-v2-'+key) !== serialized) throw new Error('تعذر تأكيد حفظ البيانات في هذا المتصفح.');
  }};
}
export function notify(message:string){window.dispatchEvent(new CustomEvent('trbhh-notice',{detail:message}));}
export function readLocal<T>(key:string,fallback:T):T{
  if (serverStorage) return serverStorage.read(key, fallback);
  try{return JSON.parse(localStorage.getItem('trbhh-v2-'+key)||'null')??fallback;}catch{return fallback;}
}
export function writeLocal(key:string,value:unknown){
  if (serverStorage) throw new Error('Server storage requires awaited persistLocal().');
  try{localStorage.setItem('trbhh-v2-'+key,JSON.stringify(value));}catch{notify('تعذر الحفظ على هذا المتصفح. يمكنك إكمال التجربة دون حفظ دائم.');}
}
// Explicit saves reject on failure. Server mode never falls back to localStorage,
// including if a component finishes an async operation after provider unmount.
export async function persistLocal(key: string, value: unknown, mode?: PreviewStorageMode): Promise<void> {
  await capturePreviewStorage(mode).write(key, value);
}
