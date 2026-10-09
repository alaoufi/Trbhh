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
  // حقول الحساب الأساسي + حقول الملفات/الهويات (profiles) كي يجد البحث حساباً
  // اسمه الأساسي «اوتاد سدير» بينما له ملف باسم «أبو ماجد 1/2».
  const userFields = ['name', 'userName', 'email', 'phoneNumber', 'CAST(id AS CHAR)'];
  const profileFields = ['p.name', 'p.phone', 'p.whatsapp', 'p.handle'];
  const args: string[] = [];
  const sql = terms.map((term) => {
    const like = `%${term}%`;
    const userExpr = userFields.map((field) => { args.push(like); return `${sqlNormalized(field)} LIKE ?`; }).join(' OR ');
    const profExpr = profileFields.map((field) => { args.push(like); return `${sqlNormalized(field)} LIKE ?`; }).join(' OR ');
    return `(${userExpr} OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = users.id AND (${profExpr})))`;
  }).join(' AND ');
  return { sql, args };
}

export function maskMemberPhone(phone: string | null | undefined): string {
  const value = String(phone || '').trim();
  if (!value) return '—';
  if (value.length <= 4) return value;
  return `${value.slice(0, Math.min(4, value.length - 2))}•••${value.slice(-2)}`;
}
