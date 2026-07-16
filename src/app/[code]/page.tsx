import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';

/** روابط مختصرة من الموقع السابق (جدول short_links المستورد) — تُعاد توجيهها
 * لمسارها الأصلي بدل أن تُظهر 404. أي مسار من مجلد واحد غير معرّف صراحة
 * (login, ads, ...) ينتهي به المطاف هنا فقط، فلا يتعارض مع أي صفحة حقيقية. */
export default async function ShortLink({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const row = await prisma.short_links.findFirst({ where: { short: code } }).catch(() => null);
  if (!row?.route) notFound();
  const target = row.route.startsWith('/') ? row.route : `/${row.route}`;
  redirect(target);
}
