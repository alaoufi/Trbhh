import { NextResponse } from 'next/server';
import { getAppConfig } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * Version gate for the native app shells. The shells open the site with
 * ?app=android&v=<versionCode> (or ?app=ios&v=<build>); the ForceUpdateGate
 * component compares that against min* here and hard-blocks outdated shells.
 * Values are admin-editable (site settings) — raising min forces an update.
 */
export async function GET() {
  const cfg = await getAppConfig();
  return NextResponse.json(
    {
      android: { minCode: cfg.android.minCode, storeUrl: cfg.android.storeUrl },
      ios: { minBuild: cfg.ios.minBuild, storeUrl: cfg.ios.storeUrl },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
