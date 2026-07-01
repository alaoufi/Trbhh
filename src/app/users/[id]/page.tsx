import { notFound } from 'next/navigation';
import { BadgeCheck, MapPin } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt } from '@/lib/utils';
import { getMyAds } from '@/lib/account';
import { AdGrid } from '@/components/ad-card';
import { timeAgo } from '@/lib/utils';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await prisma.users.findUnique({ where: { id: BigInt(Number(id)) }, select: { name: true, userName: true } });
  return { title: u?.name || u?.userName || 'ملف العضو' };
}

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await prisma.users.findUnique({ where: { id: BigInt(Number(id)) } });
  if (!user) notFound();
  const myAds = await getMyAds(toInt(user.id));
  const active = myAds.filter((a) => a.status === 1);
  const ads = active.map((a) => ({ id: a.id, title: a.title, price: a.price, adsType: a.adsType, image: a.image, cityName: null, categoryName: null, createdAt: a.createdAt, special: a.special, views: 0 }));
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-2xl font-bold text-accent-foreground">
            {(user.name || user.userName || 'ع').charAt(0)}
          </span>
          <div>
            <div className="flex items-center gap-1 text-lg font-bold">
              {user.name || user.userName || 'مستخدم'}
              {user.trusted === 1 && <BadgeCheck className="h-5 w-5 text-primary" />}
            </div>
            <div className="text-sm text-muted-foreground">عضو منذ {timeAgo(user.created_at)} · {active.length} إعلان نشط</div>
          </div>
        </div>
      </div>
      <h2 className="text-lg font-bold">إعلانات العضو</h2>
      <AdGrid ads={ads} />
    </div>
  );
}
