'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { saveUpload } from '@/lib/storage';
import { toInt } from '@/lib/utils';

async function storeDoc(file: FormDataEntryValue | null, userId: number, kind: string): Promise<number | undefined> {
  if (!(file instanceof File) || file.size === 0) return undefined;
  const srcExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const { normalizeUpload } = await import('@/lib/upload-normalize');
  const norm = await normalizeUpload(Buffer.from(await file.arrayBuffer()), srcExt); // HEIC → JPEG (PDF kept) so admins can view the doc
  const rel = await saveUpload(norm.buf, `verify_${kind}_${userId}_${Date.now()}.${norm.ext}`);
  const up = await prisma.uploads.create({ data: { file_name: rel, extension: norm.ext, type: `verify_${kind}`, file_size: norm.buf.length, user_id: userId } });
  return toInt(up.id);
}

/** تجديد توثيق الحساب العادي فوراً بالخصم من الرصيد — بلا موافقة (أول توثيق فقط بموافقة). */
export async function renewAccountVerificationAction() {
  const session = await requireUser();
  const { redirect } = await import('next/navigation');
  const { renewAccountVerification } = await import('@/lib/account-verify');
  const r = await renewAccountVerification(session.uid);
  revalidatePath('/account/verify');
  redirect(r.ok ? '/account/verify?renewed=1' : `/account/verify?err=${r.reason || 'err'}`);
}

export async function submitVerificationAction(formData: FormData) {
  const session = await requireUser();
  const national = await storeDoc(formData.get('national_identity'), session.uid, 'nid');
  const commercial = await storeDoc(formData.get('commercial_register'), session.uid, 'cr');
  const work = await storeDoc(formData.get('work_permit'), session.uid, 'wp');
  await prisma.users.update({
    where: { id: BigInt(session.uid) },
    data: {
      ...(national ? { national_identity: national } : {}),
      ...(commercial ? { commercial_register: commercial } : {}),
      ...(work ? { work_permit: work } : {}),
      step: 1, // pending review
    },
  });
  revalidatePath('/account/verify');
}
