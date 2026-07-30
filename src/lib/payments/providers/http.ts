import 'server-only';

/** طلب HTTP يعيد JSON مع مهلة زمنية — لا يرمي أبداً؛ يعيد {ok,status,data} أو خطأ. */
export async function httpJson(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; error?: string }> {
  const { timeoutMs = 15000, ...rest } = init;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctl.signal });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try { data = text ? (JSON.parse(text) as Record<string, unknown>) : {}; } catch { data = { raw: text }; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: {}, error: e instanceof Error ? e.message : 'network error' };
  } finally {
    clearTimeout(timer);
  }
}

/** قراءة قيمة نصّية من كائن JSON غير موثوق النوع. */
export function str(o: unknown, key: string): string | undefined {
  if (o && typeof o === 'object' && key in o) {
    const v = (o as Record<string, unknown>)[key];
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

/** قراءة كائن متداخل. */
export function obj(o: unknown, key: string): Record<string, unknown> | undefined {
  if (o && typeof o === 'object' && key in o) {
    const v = (o as Record<string, unknown>)[key];
    if (v && typeof v === 'object') return v as Record<string, unknown>;
  }
  return undefined;
}
