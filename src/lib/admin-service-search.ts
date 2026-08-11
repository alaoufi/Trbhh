import { ADMIN_NAV, type AdminNavItem } from '@/components/admin-nav-def';
import type { Perm } from '@/lib/roles';

function normalizeArabic(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');
}

export function findAdminServices(query: string, permissions: Set<Perm>): AdminNavItem[] {
  const terms = normalizeArabic(query).split(' ').filter(Boolean);
  if (!terms.length) return [];

  return ADMIN_NAV
    .filter((item) => item.perm === null || permissions.has(item.perm))
    .map((item) => {
      const haystack = normalizeArabic([item.label, item.description || '', ...(item.keywords || [])].join(' '));
      const matched = terms.filter((term) => haystack.includes(term)).length;
      return { item, matched, starts: normalizeArabic(item.label).startsWith(terms.join(' ')) };
    })
    .filter((row) => row.matched > 0)
    .sort((a, b) => Number(b.starts) - Number(a.starts) || b.matched - a.matched || a.item.label.localeCompare(b.item.label, 'ar'))
    .map((row) => row.item);
}
