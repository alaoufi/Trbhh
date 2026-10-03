'use server';
import { requireAction } from '@/lib/roles';
import { setSetting } from '@/lib/settings';
import { REPORT_FOLLOWUP_ENABLED } from '@/lib/report-followup';
import { isReadOnlyPreview } from '@/lib/read-only-preview';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { REPORT_COMMON_REASONS } from '@/lib/report-reasons';
export async function saveReportReasons(form: FormData) {
  await requireAction('reports', 'edit');
  if (isReadOnlyPreview()) return;
  const lines = [...new Set(String(form.get('commonReasons') || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
  if (lines.length > 40 || lines.some(s => s.length > 80)) redirect('/admin/reports?tab=followup&reasonsError=1');
  await setSetting(REPORT_COMMON_REASONS, lines.join('\n'));
  revalidatePath('/report');
  revalidatePath('/admin/reports');
}
export async function toggleReportFollowup(form: FormData) {
  await requireAction('reports', 'edit');
  if (isReadOnlyPreview()) return;
  await setSetting(REPORT_FOLLOWUP_ENABLED, form.get('enabled') === '1' ? '1' : '0');
  revalidatePath('/admin/reports');
}
