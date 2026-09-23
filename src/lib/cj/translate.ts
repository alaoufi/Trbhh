import 'server-only';

/**
 * ترجمة آلية إلى العربية لمحتوى سلع CJ (الاسم/الوصف). تستخدم نقطة ترجمة Google
 * المجانية (بلا مفتاح) مع مهلة وتسلسل خفيف. عند أي فشل تُعيد null فيبقى النص كما هو
 * ويستطيع المشرف تحريره يدوياً — لا تُوقِف الاستيراد أبداً.
 *
 * قراءة فقط لخدمة الترجمة؛ لا تمسّ CJ ولا أي بيانات دفع.
 */

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const TIMEOUT_MS = 8000;
const MAX_LEN = 1200; // سقف طول الإدخال (أسماء/أوصاف قصيرة)
const MIN_GAP_MS = 350; // تباعد خفيف بين الطلبات

let lastAt = 0;
let gate: Promise<void> = Promise.resolve();
function throttle(): Promise<void> {
  gate = gate.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
  });
  return gate;
}

const arabic = /[؀-ۿ]/;

/** يترجم نصاً إنجليزياً إلى العربية. يُعيد null عند الفشل أو النص الفارغ. */
export async function translateToArabic(text: string | null | undefined): Promise<string | null> {
  const src = (text ?? '').trim();
  if (!src) return null;
  if (arabic.test(src)) return src; // معرّب أصلاً — لا تُهدر طلباً
  const clipped = src.slice(0, MAX_LEN);
  await throttle();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${ENDPOINT}?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(clipped)}`;
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    // الشكل: [[["ترجمة","الأصل",...], ...], ...]
    if (!Array.isArray(body) || !Array.isArray(body[0])) return null;
    const out = (body[0] as unknown[])
      .map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
      .join('')
      .trim();
    return out || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
