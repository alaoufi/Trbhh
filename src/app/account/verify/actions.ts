'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { saveUpload } from '@/lib/storage';
import { toInt } from '@/lib/utils';

async function storeDoc(file: FormDataEntryValue | null, userId: number, kind: string): Promise<number | undefined> {
  if (!(file instanceof File) || file.size === 0) return undefined;
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  const rel = await saveUpload(buf, `verify_${kind}_${userId}_${Date.now()}.${ext}`);
  const up = await prisma.uploads.create({ data: { file_name: rel, extension: ext, type: `verify_${kind}`, file_size: file.size, user_id: userId } });
  return toInt(up.id);
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
