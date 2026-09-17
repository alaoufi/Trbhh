export type CategoryField = { id: number; key: string; label: string; type: string; options: string[]; required: boolean };
export type CategoryOption = { id: number; name: string; active: boolean; branches: { id: number; name: string; active: boolean }[]; fields: CategoryField[] };

export function validateCategoryValues(fields: CategoryField[], input: Record<string, string>, existing = false) {
  const values: { field_id: bigint; value_text: string }[] = [];
  for (const field of fields) {
    const value = (input[String(field.id)] || '').trim();
    if (!value) {
      if (field.required && !existing) throw new Error(`أكمل حقل ${field.label}`);
      continue;
    }
    if (value.length > 500) throw new Error(`قيمة ${field.label} طويلة جداً`);
    if (field.type === 'number' && (!Number.isFinite(Number(value)) || Number(value) < 0)) throw new Error(`أدخل رقماً صحيحاً في ${field.label}`);
    if (field.type === 'select' && !field.options.includes(value)) throw new Error(`اختيار غير صالح في ${field.label}`);
    values.push({ field_id: BigInt(field.id), value_text: value });
  }
  const allowed = new Set(fields.map((field) => String(field.id)));
  if (Object.keys(input).some((id) => !allowed.has(id))) throw new Error('حقول لا تنتمي للقسم المحدد');
  return values;
}

export function chooseCategory(title: string, detail: string, candidates: { id: number; name: string; keywords: string[] }[], fallback: number) {
  const norm = (text: string) => text.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u065F]/g, '');
  const t = norm(title), d = norm(detail);
  const ranked = candidates.map((c) => {
    const hits = c.keywords.filter((word) => t.includes(norm(word)) || d.includes(norm(word)));
    const score = hits.reduce((sum, word) => sum + (t.includes(norm(word)) ? 3 : 1), 0);
    return { id: c.id, hits, score };
  }).sort((a,b) => b.score-a.score);
  const first = ranked[0], second = ranked[1];
  if (!first?.score) return { categoryId: fallback, confidence: 0, matched: [] as string[] };
  // Confidence is a heuristic, never a probability. Ambiguous ties require review.
  const confidence = first.score === second?.score ? 0.4 : Math.min(0.95, 0.5 + first.score / 30);
  return { categoryId: first.id, confidence, matched: first.hits };
}
