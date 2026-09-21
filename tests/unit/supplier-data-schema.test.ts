import {describe,it,expect} from 'vitest';
import {ONBOARDING_DDL} from '@/lib/suppliers/onboarding-schema';

describe('supplier data invitation schema',()=>{
 it('keeps one revocable invitation per supplier and stores a unique fixed-size token digest',()=>{
  const sql=ONBOARDING_DDL.join('\n');
  expect(sql).toContain('supplier_data_invitations');
  expect(sql).toMatch(/token_hash BINARY\(32\).*UNIQUE/s);
  expect(sql).toContain('generation INT');
  expect(sql).toContain('encrypted_draft MEDIUMTEXT');
  expect(sql).toContain('status VARCHAR(24)');
  expect(sql).toContain('ON DELETE RESTRICT');
 });
});
