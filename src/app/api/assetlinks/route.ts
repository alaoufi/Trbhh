import { NextResponse } from 'next/server';
import { getAppConfig } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * Digital Asset Links for the Android TWA (rewritten from
 * /.well-known/assetlinks.json). Until the admin saves the app-signing
 * SHA-256 fingerprint in settings, an empty relation list is served.
 */
export async function GET() {
  const { android } = await getAppConfig();
  const prints = android.sha256
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const body = prints.length
    ? [{
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: android.package,
          sha256_cert_fingerprints: prints,
        },
      }]
    : [];
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
