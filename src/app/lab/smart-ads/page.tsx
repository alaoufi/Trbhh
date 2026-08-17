import { DynamicAdForm } from '@/components/dynamic-ads/dynamic-ad-form';
import { requireSmartAdsLab } from '@/lib/dynamic-ads/access';
import { listDynamicEntities } from '@/lib/dynamic-ads/repository';
import { analyseSmartAdAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false }, title: 'مختبر الإعلانات الذكية' };
export default async function SmartAdsLabPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) { await requireSmartAdsLab(); const [entities, params] = await Promise.all([listDynamicEntities(), searchParams]); return <DynamicAdForm entities={entities} action={analyseSmartAdAction} error={params.error} />; }
