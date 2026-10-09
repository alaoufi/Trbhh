import { describe, expect, it } from 'vitest';
import { memberSearchSql, memberSearchTerms, normalizeMemberSearch } from '@/lib/member-admin-search';

describe('member administration Arabic search', () => {
  it('normalizes common Arabic spelling and numeral differences', () => {
    expect(normalizeMemberSearch('أبو  مـاجِد ١')).toBe('ابو ماجد 1');
    expect(memberSearchTerms('ابو ماجد')).toEqual(['ابو', 'ماجد']);
  });

  it('requires every entered term and keeps parameters separate', () => {
    const built = memberSearchSql('أبو ماجد');
    expect(built.sql).toContain(' AND ');
    expect(built.args).toContain('%ابو%');
    expect(built.args).toContain('%ماجد%');
  });

  it('also matches profile/identity names (e.g. «أبو ماجد 1» under a store account)', () => {
    const built = memberSearchSql('أبو ماجد');
    expect(built.sql).toContain('EXISTS');
    expect(built.sql).toContain('FROM profiles p WHERE p.user_id = users.id');
  });
});
