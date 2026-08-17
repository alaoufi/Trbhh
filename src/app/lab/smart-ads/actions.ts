'use server';
import { redirect } from 'next/navigation';
import { analyseDynamicAd, analysisFingerprint } from '@/lib/dynamic-ads/analyser';
import { requireSmartAdsLab } from '@/lib/dynamic-ads/access';
import { dynamicEntityByKey, saveDynamicDraft } from '@/lib/dynamic-ads/repository';
import { confirmDynamicDraftEntity } from '@/lib/dynamic-ads/repository';
import { validateDynamicValues } from '@/lib/dynamic-ads/schema';

export async function analyseSmartAdAction(formData: FormData) {
  const session = await requireSmartAdsLab();
  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim();
  if (!title) redirect('/lab/smart-ads?error=title');
  const requestedKey = String(formData.get('entity_key') || '').trim();
  const selected = requestedKey && requestedKey !== 'auto' ? await dynamicEntityByKey(requestedKey) : null;
  if (requestedKey && requestedKey !== 'auto' && !selected?.active) redirect('/lab/smart-ads?error=entity');
  const rawValues: Record<string, string | string[]> = {};
  for (const [key, value] of formData.entries()) if (key.startsWith('dynamic_')) { const field = key.slice(8); const current = rawValues[field]; rawValues[field] = current === undefined ? String(value) : Array.isArray(current) ? [...current, String(value)] : [current, String(value)]; }
  const validation = selected ? validateDynamicValues(selected.fields, rawValues) : { ok: true, values: {}, errors: {} };
  if (!validation.ok) redirect(`/lab/smart-ads?error=fields&entity=${encodeURIComponent(requestedKey)}`);
  const analysis = analyseDynamicAd({ title, description });
  const id = await saveDynamicDraft({
    userId: session.uid, entityId: selected?.id ?? null, title, description,
    price: Number(formData.get('price')) > 0 ? Number(formData.get('price')) : null,
    locationText: String(formData.get('location') || '').trim() || null,
    values: validation.values, fingerprint: analysisFingerprint({ title, description }), analysis,
  });
  redirect(`/lab/smart-ads/${id}/analyze`);
}

export async function confirmSmartAdEntityAction(formData: FormData) {
  const session = await requireSmartAdsLab();
  const draftId = Number(formData.get('draft_id'));
  const entityId = Number(formData.get('entity_id'));
  if (!Number.isSafeInteger(draftId) || !Number.isSafeInteger(entityId)) redirect('/lab/smart-ads');
  await confirmDynamicDraftEntity({ draftId, entityId, userId: session.uid });
  redirect(`/lab/smart-ads/${draftId}/analyze?confirmed=1`);
}
