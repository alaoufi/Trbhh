import { describe, it, expect } from 'vitest';
import { assertSelectOnlyGrants } from '../../src/lib/preview-grants';
describe('preview startup grant gate',()=>{
 it('accepts only usage and database SELECT without grant option',()=>{
  expect(()=>assertSelectOnlyGrants(['GRANT USAGE ON *.* TO `p`@`%`','GRANT SELECT ON `trbhhdb`.* TO `p`@`%`'],'trbhhdb','NONE')).not.toThrow();
 });
 it('rejects any write, global access, roles, unrelated schema or grant option',()=>{
  for(const grant of ['GRANT ALL PRIVILEGES ON `trbhhdb`.* TO `p`@`%`','GRANT SELECT, UPDATE ON `trbhhdb`.* TO `p`@`%`','GRANT SELECT ON *.* TO `p`@`%`','GRANT SELECT ON `other`.* TO `p`@`%`','GRANT SELECT ON `trbhhdb`.* TO `p`@`%` WITH GRANT OPTION','GRANT `admin`@`%` TO `p`@`%`']) expect(()=>assertSelectOnlyGrants([grant],'trbhhdb','NONE')).toThrow();
  expect(()=>assertSelectOnlyGrants([],'trbhhdb','NONE')).toThrow();
  expect(()=>assertSelectOnlyGrants(['GRANT SELECT ON `trbhhdb`.* TO `p`@`%`'],'trbhhdb','`admin`@`%`')).toThrow();
 });
});
