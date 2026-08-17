'use server';
import { revalidatePath } from 'next/cache';
import { requireAction } from '@/lib/roles';
import { setSetting } from '@/lib/settings';
import { createDynamicEntity, createDynamicField, setDynamicEntityActive } from '@/lib/dynamic-ads/repository';
import { SMART_ADS_LAB_SETTING } from '@/lib/dynamic-ads/access';
import type { DynamicFieldType } from '@/lib/dynamic-ads/schema';

async function guard() { await requireAction('users', 'edit'); }
function refresh() { revalidatePath('/admin/smart-ads'); revalidatePath('/lab/smart-ads'); }
export async function setSmartAdsLabEnabledAction(formData: FormData) { await guard(); await setSetting(SMART_ADS_LAB_SETTING, formData.get('enabled') === '1' ? '1' : '0'); refresh(); }
export async function addDynamicEntityAction(formData: FormData) { await guard(); await createDynamicEntity({ key: String(formData.get('key') || '').trim().toLowerCase(), name: String(formData.get('name') || '').trim(), icon: String(formData.get('icon') || '📦').trim() }); refresh(); }
export async function addDynamicFieldAction(formData: FormData) { await guard(); const type = String(formData.get('type') || 'text') as DynamicFieldType; if (!['text','textarea','number','select','boolean','date','location','media'].includes(type)) throw new Error('invalid_field_type'); await createDynamicField({ entityId: Number(formData.get('entity_id')), key: String(formData.get('key') || '').trim().toLowerCase(), label: String(formData.get('label') || '').trim(), type, required: formData.get('required') === '1', searchable: formData.get('searchable') === '1', options: String(formData.get('options') || '').split('\n').map((item) => item.trim()).filter(Boolean) }); refresh(); }
export async function toggleDynamicEntityAction(formData: FormData) { await guard(); await setDynamicEntityActive(Number(formData.get('id')), formData.get('active') === '1'); refresh(); }
