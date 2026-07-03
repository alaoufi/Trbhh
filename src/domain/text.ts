// Pure Arabic-text analysis used by ad moderation (no I/O — fully unit-testable).
// Extracted verbatim from app/ads/actions.ts as the first strangler step.

/** Normalize Arabic text for duplicate comparison. */
export function normalizeAr(s: string): string {
  return s
    .normalize('NFKD')
    // ALL combining marks: diacritics AND the hamza/madda marks that NFKD
    // splits off of أ/إ/آ — dropping them here folds those letters into ا.
    // (The old diacritics-only class let the decomposed hamza fall through to
    // the punctuation rule, injecting a space mid-word: 'أحمد' → 'ا حمد'.)
    .replace(/\p{M}+/gu, '')
    .replace(/[آأإا]/g, 'ا') // any composed alef variants that survived
    .replace(/ى/g, 'ي') // alef maqsura -> ya
    .replace(/ة/g, 'ه') // ta marbuta -> ha
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // drop punctuation/emoji
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Token-overlap (Jaccard) similarity between two normalized strings. */
export function similarity(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Detect keyword-stuffing (حشو الكلمات): the same word or short phrase repeated
 * many times to manipulate Google search. Returns true when the text is spammy.
 */
export function isKeywordStuffing(title: string, detail: string): boolean {
  const words = normalizeAr(`${title} ${detail}`).split(' ').filter((w) => w.length >= 3);
  if (words.length < 8) return false;

  // 1) a single word dominating the text (e.g. "تأجير تأجير تأجير …")
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  let topCount = 0;
  for (const c of freq.values()) if (c > topCount) topCount = c;
  if (topCount >= 6 && topCount / words.length >= 0.28) return true;
  if (topCount >= 12) return true; // extreme absolute repetition regardless of length

  // 2) a repeated adjacent phrase (bigram), e.g. "رافعة شوكية رافعة شوكية …"
  const bigrams = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const key = `${words[i]} ${words[i + 1]}`;
    bigrams.set(key, (bigrams.get(key) || 0) + 1);
  }
  for (const c of bigrams.values()) if (c >= 4) return true;

  return false;
}
