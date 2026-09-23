'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { claimProduct, releaseProduct, updateAgentContact } from '@/lib/cj/agents';

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
  const result = await releaseProduct(session.uid, id);
  if (!result.ok) redirect(`/account/agent?err=${result.error}`);
  revalidatePath('/account/agent');
  revalidatePath(`/cj/${id}`);
  revalidatePath('/cj');
  redirect('/account/agent?released=1');
}

/** تحديث بيانات تواصل الوكيل نفسه (جوال/واتساب) دون تغيير حصّته أو تفعيله. */
export async function updateMyAgentContactAction(form: FormData) {
  const session = await requireUser();
  const phone = String(form.get('phone') || '').trim();
  const whatsapp = String(form.get('whatsapp') || '').trim();
  if (!await updateAgentContact(session.uid, phone, whatsapp)) redirect('/account/agent?err=not_agent');
  revalidatePath('/account/agent');
  redirect('/account/agent?saved=1');
}
