'use server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { hashPassword, createSession } from '@/lib/auth';
import { verifyLogin } from '@/lib/login-core';

export async function loginAction(_prev: unknown, formData: FormData) {
  const identifier = String(formData.get('identifier') || '').trim();
  const password = String(formData.get('password') || '');
  const r = await verifyLogin(identifier, password);
  if (!r.ok) return { error: r.error };

  await createSession({ uid: r.uid, name: r.name, type: r.type });
  const next = String(formData.get('next') || '');
  if (next.startsWith('/') && !next.startsWith('//')) redirect(next);
  // بيانات الدخول موحّدة: نفس الجلسة تفتح تربح وإدارة متجر العضو (إن كان له متجر).
  redirect('/');
}
