import {it,expect} from 'vitest';
import {distinctPublishingProfiles} from '@/lib/profile-primary-selection';
it('shows one primary identity for the same account without hiding distinct extra identities or stores',()=>{
 const rows=[{id:16,type:'personal',isDefault:true},{id:17,type:'personal',isDefault:true},{id:18,type:'store',isDefault:false},{id:19,type:'personal',isDefault:false}];
 expect(distinctPublishingProfiles(rows,17).map(p=>p.id)).toEqual([17,18,19]);
 expect(distinctPublishingProfiles(rows,999).map(p=>p.id)).toEqual([16,18,19]);
 expect(rows).toHaveLength(4);
});
