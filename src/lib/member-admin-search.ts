import 'server-only';

/**
 * Makes Arabic member names searchable as people type them.  This is kept on
 * the server: it is used for matching only and never changes the stored name.
 */
export function normalizeMemberSearch(value: string): string {
  return String(value || '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function memberSearchTerms(value: string): string[] {
  return normalizeMemberSearch(value).split(' ').filter(Boolean).slice(0, 6);
}

/** The matching expression mirrors normalizeMemberSearch for the SQL fields. */
const sqlNormalized = (field: string) =>
  `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(${field},''),'أ','ا'),'إ','ا'),'آ','ا'),'ة','ه'),'ى','ي'),'ـ',''),'٠','0'),'١','1'),'٢','2'),'٣','3'))`;

/**
 * Returns parameterised SQL fragments.  Each word must match one member
 * identity field, so “ابو ماجد” finds both “أبو ماجد 1” and “أبو ماجد 2”.
 */
export function memberSearchSql(query: string): { sql: string; args: string[] } {
  const terms = memberSearchTerms(query);
  if (!terms.length) return { sql: '', args: [] };
  const fields = ['name', 'userName', 'email', 'phoneNumber', 'CAST(id AS CHAR)'];
  const args: string[] = [];
  const sql = terms.map((term) => {
    const like = `%${term}%`;
    args.push(...fields.map(() => like));
    return `(${fields.map((field) => `${sqlNormalized(field)} LIKE ?`).join(' OR ')})`;
  }).join(' AND ');
  return { sql, args };
}

export function maskMemberPhone(phone: string | null | undefined): string {
  const value = String(phone || '').trim();
  if (!value) return '—';
  if (value.length <= 4) return value;
  return `${value.slice(0, Math.min(4, value.length - 2))}•••${value.slice(-2)}`;
}
