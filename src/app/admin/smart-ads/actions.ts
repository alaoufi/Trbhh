'use server';
import { revalidatePath } from 'next/cache';
import { requireAction } from '@/lib/roles';
import { setSetting } from '@/lib/settings';
import { createDynamicEntity, createDynamicField, createDynamicGroup, deleteDynamicField, reorderDynamicField, setDynamicEntityActive, setDynamicFieldActive } from '@/lib/dynamic-ads/repository';
import { SMART_ADS_LAB_SETTING } from '@/lib/dynamic-ads/access';
import type { DynamicFieldType } from '@/lib/dynamic-ads/schema';

async function guard() { await requireAction('users', 'edit'); }
function refresh() { revalidatePath('/admin/smart-ads'); revalidatePath('/lab/smart-ads'); }
export async function setSmartAdsLabEnabledAction(formData: FormData) { await guard(); await setSetting(SMART_ADS_LAB_SETTING, formData.get('enabled') === '1' ? '1' : '0'); refresh(); }
export async function addDynamicEntityAction(formData: FormData) { await guard(); await createDynamicEntity({ key: String(formData.get('key') || '').trim().toLowerCase(), name: String(formData.get('name') || '').trim(), icon: String(formData.get('icon') || '📦').trim() }); refresh(); }
export async function addDynamicGroupAction(formData: FormData) { await guard(); await createDynamicGroup({ entityId: Number(formData.get('entity_id')), key: String(formData.get('key') || '').trim().toLowerCase(), label: String(formData.get('label') || '').trim(), inputOrder: Number(formData.get('input_order')) || 999, displayOrder: Number(formData.get('display_order')) || 999 }); refresh(); }
export async function addDynamicFieldAction(formData: FormData) { await guard(); const type = String(formData.get('type') || 'text') as DynamicFieldType; if (!['text','textarea','number','decimal','select','multiselect','boolean','date','location','media','file','url'].includes(type)) throw new Error('invalid_field_type'); await createDynamicField({ entityId: Number(formData.get('entity_id')), groupId: Number(formData.get('group_id')) || null, key: String(formData.get('key') || '').trim().toLowerCase(), label: String(formData.get('label') || '').trim(), type, required: formData.get('required') === '1', searchable: formData.get('searchable') === '1', options: String(formData.get('options') || '').split('\n').map((item) => item.trim()).filter(Boolean), placeholder: String(formData.get('placeholder') || '').trim(), inputOrder: Number(formData.get('input_order')) || 999, displayOrder: Number(formData.get('display_order')) || 999, inputVisible: formData.get('input_visible') !== null, displayVisible: formData.get('display_visible') !== null }); refresh(); }
export async function toggleDynamicFieldAction(formData: FormData) { await guard(); await setDynamicFieldActive(Number(formData.get('id')), formData.get('active') === '1'); refresh(); }
export async function deleteDynamicFieldAction(formData: FormData) { await guard(); await deleteDynamicField(Number(formData.get('id'))); refresh(); }
export async function reorderDynamicFieldAction(formData: FormData) { await guard(); await reorderDynamicField(Number(formData.get('id')), Number(formData.get('input_order')), Number(formData.get('display_order'))); refresh(); }
export async function toggleDynamicEntityAction(formData: FormData) { await guard(); await setDynamicEntityActive(Number(formData.get('id')), formData.get('active') === '1'); refresh(); }
