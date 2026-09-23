'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { claimProduct, unassignProductAgent, isActiveAgent, getAgent, listAgentProducts } from '@/lib/cj/agents';

/** الوكيل يختار سلعة متاحة ضمن حصّته الأسبوعية. */
export async function claimProductAction(form: FormData) {
  const session = await requireUser();
  const id = Number(String(form.get('id') || ''));
  const res = await claimProduct(session.uid, id);
  revalidatePath('/account/agent');
  if (!res.ok) redirect(`/account/agent?err=${res.error}`);
  revalidatePath(`/cj/${id}`);
  revalidatePath('/cj');
  redirect('/account/agent?claimed=1');
}

/** الوكيل يتنازل عن سلعة من سلعه (تعود متاحة للغير). */
export async function releaseProductAction(form: FormData) {
  const session = await requireUser();
  const id = Number(String(form.get('id') || ''));
  if (!(await isActiveAgent(session.uid))) redirect('/account/agent?err=not_agent');
  // لا يتنازل إلا عن سلعة تخصّه فعلاً.
  const mine = await listAgentProducts(session.uid, 500);
  if (!mine.some((p) => Number(p.id) === id)) redirect('/account/agent?err=not_yours');
  await unassignProductAgent(id);
  revalidatePath('/account/agent');
  revalidatePath(`/cj/${id}`);
  revalidatePath('/cj');
  redirect('/account/agent?released=1');
}

/** تحديث بيانات تواصل الوكيل نفسه (جوال/واتساب) دون تغيير حصّته أو تفعيله. */
export async function updateMyAgentContactAction(form: FormData) {
  const session = await requireUser();
  const agent = await getAgent(session.uid);
  if (!agent || agent.active !== 1) redirect('/account/agent?err=not_agent');
  const { upsertAgent } = await import('@/lib/cj/agents');
  const phone = String(form.get('phone') || '').trim();
  const whatsapp = String(form.get('whatsapp') || '').trim();
  await upsertAgent({ userId: session.uid, phone, whatsapp, weeklyQuota: agent.weekly_quota, active: true, notes: agent.notes });
  revalidatePath('/account/agent');
  redirect('/account/agent?saved=1');
}
