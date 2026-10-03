'use server';
import { requireAction } from '@/lib/roles';
import { setSetting } from '@/lib/settings';
import { REPORT_FOLLOWUP_ENABLED } from '@/lib/report-followup';
import { isReadOnlyPreview } from '@/lib/read-only-preview';
import { revalidatePath } from 'next/cache';
export async function toggleReportFollowup(form: FormData) {
  await requireAction('reports', 'edit');
  if (isReadOnlyPreview()) return;
  await setSetting(REPORT_FOLLOWUP_ENABLED, form.get('enabled') === '1' ? '1' : '0');
  revalidatePath('/admin/reports');
}
