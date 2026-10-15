import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({rows:new Map<string,string>(),read:vi.fn(),write:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{site_settings:{findUnique:m.read,upsert:m.write}}}));
import {saveTaxDraft,readTaxDraft} from '@/lib/finance/tax-draft';
beforeEach(()=>{vi.clearAllMocks();m.rows.clear();m.write.mockImplementation(async({where,create}:{where:{k:string};create:{v:string}})=>{m.rows.set(where.k,create.v);});m.read.mockImplementation(async({where}:{where:{k:string}})=>m.rows.has(where.k)?{v:m.rows.get(where.k)}:null);});
it('restores incomplete data from storage on a new read and isolates accounts',async()=>{const form=new FormData();form.set('issuerName','متجر محفوظ');form.set('issuerAddress','');await saveTaxDraft(9n,form);const restored=await readTaxDraft(9n);expect(restored?.fields).toEqual({issuerName:'متجر محفوظ',issuerAddress:''});expect(await readTaxDraft(10n)).toBeNull();expect(m.rows.size).toBe(1);expect(m.write.mock.calls[0][0].where.k).toBe('finance_tax_draft_user_9');});
it('rejects invalid actor identifiers before reading or writing',async()=>{await expect(readTaxDraft(0n)).rejects.toThrow('finance_input_invalid');expect(m.read).not.toHaveBeenCalled();});
