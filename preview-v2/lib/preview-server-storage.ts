'use client';
import type { PreviewStorageAdapter } from './preview';

export const PREVIEW_STATE_KEYS = ['seller-ads-v1','ad-draft-v1','field-settings-v1'] as const;
type StateKey = typeof PREVIEW_STATE_KEYS[number];
type Values = Partial<Record<StateKey, unknown>>;
type Revisions = Partial<Record<StateKey, number>>;
export class PreviewStorageError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'PreviewStorageError'; }
}
function failure(status: number) {
  return new PreviewStorageError(status, status === 401 ? 'انتهت الجلسة. سجّل الدخول لحفظ تغييراتك.' : status === 403 ? 'تغير الحساب أو رُفضت صلاحية الحفظ. احتفظ بتعديلاتك وأعد تحميل الصفحة قبل الحفظ.' : status === 409
    ? 'تغيرت البيانات في جلسة أخرى. احتفظ بنصك وأعد تحميل الصفحة قبل إعادة المحاولة.'
    : status === 413 ? 'حجم البيانات أكبر من المسموح. قلّل الصور ثم أعد المحاولة.'
    : 'تعذر تأكيد الحفظ على الخادم. تغييراتك ما زالت في الصفحة؛ حاول مجدداً.');
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
function checkedKey(key: string): StateKey {
  if (!(PREVIEW_STATE_KEYS as readonly string[]).includes(key)) throw new Error('Unsupported preview state key.');
  return key as StateKey;
}
export type StorageStatus = { pending: number; error: PreviewStorageError | null };

export function createPreviewServerStorage(fetcher: typeof fetch = fetch): PreviewStorageAdapter & {
  hydrate(): Promise<void>;
  dispose(): void;
  subscribe(listener: (status: StorageStatus) => void): () => void;
} {
  let ready = false;
  let hydrationStarted = false;
  let ownerId: number;
  let disposed = false;
  const controller = new AbortController();
  const assertActive = () => { if (disposed) throw new PreviewStorageError(0, 'انتهت جلسة التخزين التجريبي. أعد تحميل الصفحة قبل الحفظ.'); };
  let values: Values = {};
  let revisions: Revisions = {};
  let queue: Promise<void> = Promise.resolve();
  let status: StorageStatus = {pending: 0, error: null};
  const listeners = new Set<(status: StorageStatus) => void>();
  const emit = () => listeners.forEach(listener => listener({...status}));
  return {
    dispose() { disposed = true; ready = false; controller.abort(); listeners.clear(); },
    subscribe(listener) { listeners.add(listener); listener({...status}); return () => {listeners.delete(listener);}; },
    async hydrate() {
      assertActive();
      if (hydrationStarted) throw new Error('Preview storage hydration already started.');
      hydrationStarted = true;
      await queue;
      assertActive();
      const response = await fetcher('/api/preview-state', {credentials:'same-origin', cache:'no-store', redirect:'error', signal:controller.signal});
      if (!response.ok) throw failure(response.status);
      const payload: unknown = await response.json();
      assertActive();
      if (!object(payload) || !object(payload.values) || !object(payload.revisions) || !revision(payload.ownerId) || payload.ownerId < 1) throw failure(502);
      const nextValues: Values = {}; const nextRevisions: Revisions = {};
      for (const key of PREVIEW_STATE_KEYS) {
        const version = payload.revisions[key] ?? 0;
        if (!revision(version) || (Object.hasOwn(payload.values,key) && !Object.hasOwn(payload.revisions,key))) throw failure(502);
        nextRevisions[key] = version;
        if (Object.hasOwn(payload.values,key)) nextValues[key] = clone(payload.values[key]);
      }
      ownerId = payload.ownerId; values = nextValues; revisions = nextRevisions; ready = true;
    },
    read<T>(key: string, fallback: T): T {
      if (!ready) throw new Error('Preview storage is not hydrated.');
      // Old market batch assignments are deferred in sandbox mode. Never read
      // their browser-local values or request a fourth server key.
      if (key === 'classifications-v1') return clone(fallback);
      return clone((values[checkedKey(key)] ?? fallback) as T);
    },
    async write(key: string, value: unknown) {
      assertActive();
      if (!ready) throw new Error('Preview storage is not hydrated.');
      const allowed = checkedKey(key); const snapshot = clone(value);
      status = {...status, pending: status.pending + 1}; emit();
      const task = queue.then(async () => {
        try {
          assertActive();
          const previous = revisions[allowed] ?? 0;
          const response = await fetcher('/api/preview-state', {
            method:'PUT', credentials:'same-origin', cache:'no-store', redirect:'error',
            signal:controller.signal,
            headers:{'Content-Type':'application/json'}, body:JSON.stringify({ownerId,key:allowed,value:snapshot,revision:previous}),
          });
          if (!response.ok) throw failure(response.status);
          const result: unknown = await response.json();
          assertActive();
          if (!object(result) || !revision(result.revision) || result.revision <= previous) throw failure(502);
          values[allowed] = snapshot; revisions[allowed] = result.revision;
          status = {...status, error: null};
        } catch (error) {
          const reported = error instanceof PreviewStorageError ? error : failure(0);
          status = {...status, error: reported}; throw reported;
        } finally { status = {...status, pending: status.pending - 1}; emit(); }
      });
      queue = task.catch(() => {});
      await task;
    },
  };
}
