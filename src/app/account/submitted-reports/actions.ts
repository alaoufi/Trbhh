'use server';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { ReportAccessError, replyToReport } from '@/lib/report-followup';

export async function reportReplyAction(admin: boolean, kind: string, id: string, _state: { error?: string; saved?: boolean }, form: FormData): Promise<{ error?: string; saved?: boolean }> {
  try {
    await replyToReport(kind, id, String(form.get('body') || ''), String(form.get('nonce') || ''), admin);
    revalidatePath(`/account/submitted-reports/${kind}/${id}`);
    revalidatePath(`/admin/reports/${kind}/${id}`);
    revalidatePath('/admin/reports');
    revalidatePath('/', 'layout');
    return { saved: true };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof ReportAccessError ? error.message : 'تعذر إرسال الرد. احتفظنا بالنص، حاول مجددًا.' };
  }
}
