import {describe,it,expect} from 'vitest';
import {taxDraftFields,parseTaxDraft} from '@/lib/finance/tax-draft-fields';
describe('incomplete tax settings drafts',()=>{
it('keeps partial fields and empty values without requiring a valid policy',()=>{const f=new FormData();f.set('issuerName','متجر');f.set('issuerAddress','');f.set('vatPercent','unfinished');expect(taxDraftFields(f)).toEqual({issuerName:'متجر',issuerAddress:'',vatPercent:'unfinished'});});
it('excludes foreign keys and refuses oversized fields',()=>{const f=new FormData();f.set('actorId','99');f.set('approved','1');expect(taxDraftFields(f)).toEqual({});f.set('issuerAddress','x'.repeat(501));expect(()=>taxDraftFields(f)).toThrow('finance_input_invalid');});
it('restores the stored version and never treats draft as approved',()=>{const draft={version:1,fields:{issuerName:'متجر'},savedAt:'2026-10-15T01:00:00.000Z'};expect(parseTaxDraft(JSON.stringify(draft))).toEqual(draft);expect(parseTaxDraft('{broken')).toBeNull();expect(parseTaxDraft(JSON.stringify({...draft,version:2}))).toBeNull();});
});
