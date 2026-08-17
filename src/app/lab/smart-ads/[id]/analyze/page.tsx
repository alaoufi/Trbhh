import { notFound } from 'next/navigation';
import { AnalysisReport } from '@/components/dynamic-ads/analysis-report';
import { requireSmartAdsLab } from '@/lib/dynamic-ads/access';
import { dynamicDraftById, listDynamicEntities } from '@/lib/dynamic-ads/repository';
import { confirmSmartAdEntityAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false }, title: 'AI Advertisement Analyzer' };
export default async function SmartAdAnalysisPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ confirmed?: string }> }) { const session = await requireSmartAdsLab(); const id = Number((await params).id); if (!Number.isSafeInteger(id) || id < 1) notFound(); const [draft, entities, query] = await Promise.all([dynamicDraftById(id, session.uid), listDynamicEntities(), searchParams]); if (!draft) notFound(); return <AnalysisReport draft={draft} entities={entities} confirmAction={confirmSmartAdEntityAction} confirmed={query.confirmed === '1'} />; }
