import { notFound } from 'next/navigation';
import { BadgeCheck } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { timeAgo } from '@/lib/utils';
import { getMyAds } from '@/lib/account';
import { getSellerRating, getUserReviews, canReview } from '@/lib/reviews';
import { getSession } from '@/lib/auth';
import { AdGrid } from '@/components/ad-card';
import { Stars } from '@/components/stars';
import { ReviewForm } from '@/components/review-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await prisma.users.findUnique({ where: { id: BigInt(Number(id)) }, select: { name: true, userName: true } });
  return { title: u?.name || u?.userName || 'ملف العضو' };
}

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = Number(id);
  const user = await prisma.users.findUnique({ where: { id: BigInt(uid) } });
  if (!user) notFound();

  const session = await getSession();
  const [myAds, rating, reviews, allowReview] = await Promise.all([
    getMyAds(uid),
    getSellerRating(uid),
    getUserReviews(uid),
    canReview(uid, session?.uid),
  ]);
  const active = myAds.filter((a) => a.status === 1);
  const ads = active.map((a) => ({ id: a.id, title: a.title, price: a.price, adsType: a.adsType, image: a.image, cityName: null, categoryName: null, createdAt: a.createdAt, special: a.special, views: 0, sellerName: null, sellerTrusted: false }));

  return (
    <div className="space-y-4">
      <div className="card-3d rounded-xl p-5">
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
            {rating.count > 0 && (
              <div className="mt-1 flex items-center gap-2 text-sm">
                <Stars value={rating.avg} /> <span className="font-semibold">{rating.avg}</span>
                <span className="text-muted-foreground">({rating.count} تقييم)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <h2 className="text-lg font-bold">إعلانات العضو</h2>
      <AdGrid ads={ads} />

      <section id="review" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-bold text-primary">التقييمات ({reviews.length})</h2>
        {allowReview ? (
          <ReviewForm reciverId={uid} />
        ) : !session ? (
          <a href="/login" className="card-3d block rounded-xl p-3 text-center text-sm text-primary">سجّل الدخول لتقييم هذا العضو</a>
        ) : session.uid === uid ? (
          <p className="text-sm text-muted-foreground">لا يمكنك تقييم نفسك.</p>
        ) : (
          <p className="text-sm text-muted-foreground">لقد قيّمت هذا العضو مسبقاً.</p>
        )}
        <ul className="space-y-2">
          {reviews.map((r) => (
            <li key={r.id} className="card-3d rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{r.author}</span>
                <Stars value={r.star} />
              </div>
              {r.review && <p className="mt-1 text-sm text-foreground/90">{r.review}</p>}
              <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
            </li>
          ))}
          {reviews.length === 0 && <p className="text-sm text-muted-foreground">لا توجد تقييمات بعد.</p>}
        </ul>
      </section>
    </div>
  );
}
