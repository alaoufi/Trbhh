import 'server-only';
import {prisma} from '@/lib/prisma';
import {taxDraftFields,parseTaxDraft,type TaxDraft} from './tax-draft-fields';
function key(userId:bigint){if(userId<1n)throw Error('finance_input_invalid');return 'finance_tax_draft_user_'+userId;}
/** Private editor state only. Never read by fiscal policy or invoice issuance. Callers require tax view/manage_settings. */
export async function readTaxDraft(userId:bigint):Promise<TaxDraft|null>{const row=await prisma.site_settings.findUnique({where:{k:key(userId)},select:{v:true}});return parseTaxDraft(row?.v);}
export async function saveTaxDraft(userId:bigint,form:FormData){const draft:TaxDraft={version:1,fields:taxDraftFields(form),savedAt:new Date().toISOString()},k=key(userId),v=JSON.stringify(draft);await prisma.site_settings.upsert({where:{k},create:{k,v},update:{v}});return draft;}
