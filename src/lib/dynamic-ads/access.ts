import 'server-only';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasAccess } from '@/lib/access-control/guards';
import { getSettingBool } from '@/lib/settings';

export const SMART_ADS_LAB_SETTING = 'smart_ads_lab_enabled';
export function canUseSmartAdsLab(input: { enabled: boolean; authorised: boolean }) { return input.enabled && input.authorised; }

/** Hidden lab gate: never redirect unauthorised visitors, and never expose its existence. */
export async function requireSmartAdsLab(action:'view'|'create'|'edit'='view') {
  const session = await getSession();
  const [enabled, authorised] = await Promise.all([
    getSettingBool(SMART_ADS_LAB_SETTING, false),
    session ? Promise.all([hasAccess(session.uid,'smart_ads','view'),action==='view'?Promise.resolve(true):hasAccess(session.uid,'smart_ads',action)]).then(results=>results.every(Boolean)) : Promise.resolve(false),
  ]);
  if (!session || !canUseSmartAdsLab({ enabled, authorised })) notFound();
  return session;
}
