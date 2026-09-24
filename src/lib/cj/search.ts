import 'server-only';

const MAX_QUERY_LENGTH = 100;
const TIMEOUT_MS = 2_500;
const hasArabic = (value: string) => /\p{Script=Arabic}/u.test(value);

function cleanEnglish(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
  if (!text || text.length > MAX_QUERY_LENGTH || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID (?:EMAIL|LANGUAGE)/i.test(text)) return null;
  return /\p{Script=Latin}/u.test(text) && !hasArabic(text) ? text : null;
}

async function requestJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {signal: controller.signal, headers: {'User-Agent': 'Mozilla/5.0'}});
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** CJ indexes its catalog by source-language names. Translate Arabic search terms without persisting them. */
export async function translateArabicCjSearch(query: string): Promise<string | null> {
  const source = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!source) return '';
  if (!hasArabic(source)) return source;

  const memoryUrl = new URL('https://api.mymemory.translated.net/get');
  memoryUrl.searchParams.set('q', source);
  memoryUrl.searchParams.set('langpair', 'ar|en');
  const memory = await requestJson(memoryUrl.href) as {responseStatus?: number; responseData?: {translatedText?: unknown}} | null;
  if (memory?.responseStatus === 200) {
    const translated = cleanEnglish(memory.responseData?.translatedText);
    if (translated) return translated;
  }

  const googleUrl = new URL('https://translate.googleapis.com/translate_a/single');
  googleUrl.searchParams.set('client', 'gtx');
  googleUrl.searchParams.set('sl', 'ar');
  googleUrl.searchParams.set('tl', 'en');
  googleUrl.searchParams.set('dt', 't');
  googleUrl.searchParams.set('q', source);
  const google = await requestJson(googleUrl.href);
  if (!Array.isArray(google) || !Array.isArray(google[0])) return null;
  const translated = google[0].flatMap((segment: unknown) => Array.isArray(segment) && typeof segment[0] === 'string' ? [segment[0]] : []).join('');
  return cleanEnglish(translated);
}
