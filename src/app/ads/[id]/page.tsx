import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, Eye, Phone, MessageCircle, BadgeCheck, Calendar, Tag } from 'lucide-react';
import { getAd } from '@/lib/data';
import { formatPrice, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DisclaimerBar } from '@/components/disclaimer';
import { SITE } from '@/lib/constants';

export const revalidate = 30;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ad = await getAd(Number(id));
  if (!ad) return { title: 'إعلان غير موجود' };
  return {
    title: ad.title,
    description: ad.detail?.slice(0, 160),
    openGraph: { images: ad.images.slice(0, 1), title: ad.title },
  };
}

export default async function AdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ad = await getAd(Number(id));
  if (!ad) notFound();

  const waNumber = ad.seller?.whatsapp?.replace(/[^\d]/g, '');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: ad.title,
    description: ad.detail,
    image: ad.images,
    ...(ad.price > 0
      ? { offers: { '@type': 'Offer', price: ad.price, priceCurrency: 'SAR', availability: 'https://schema.org/InStock' } }
      : {}),
  };

  return (
    <div className="space-y-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="text-sm text-muted-foreground">
        <Link href="/" className="hover:text-primary">الرئيسية</Link>
        {ad.category && (
          <>
            {' / '}
            <Link href={`/categories/${ad.category.id}`} className="hover:text-primary">{ad.category.name}</Link>
          </>
        )}
      </nav>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Gallery + details */}
        <div className="space-y-4 lg:col-span-2">
          <div className="relative aspect-video overflow-hidden rounded-xl border bg-muted">
            <Image src={ad.images[0]} alt={ad.title} fill sizes="(max-width:1024px) 100vw, 66vw" className="object-contain" priority />
            <div className="absolute right-3 top-3 flex gap-1">
              {ad.special && <Badge variant="special">مميّز</Badge>}
              <Badge variant={ad.adsType === 'offer' ? 'trusted' : 'muted'}>
                {ad.adsType === 'offer' ? 'عرض' : 'طلب'}
              </Badge>
            </div>
          </div>
          {ad.images.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {ad.images.slice(0, 10).map((img, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                  <Image src={img} alt={`${ad.title} ${i + 1}`} fill sizes="20vw" className="object-cover" />
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <h1 className="text-xl font-bold">{ad.title}</h1>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {ad.city || 'غير محدد'}</span>
              <span className="flex items-center gap-1"><Eye className="h-4 w-4" /> {ad.views} مشاهدة</span>
              <span className="flex items-center gap-1"><Calendar className="h-4 w-4" /> {timeAgo(ad.createdAt)}</span>
              {ad.category && <span className="flex items-center gap-1"><Tag className="h-4 w-4" /> {ad.category.name}</span>}
            </div>
            <div className="mt-4 text-2xl font-bold text-primary">{formatPrice(ad.price)}</div>
            <p className="mt-4 whitespace-pre-line leading-7 text-foreground/90">{ad.detail}</p>
          </div>
        </div>

        {/* Sidebar: seller + contact */}
        <aside className="space-y-4">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-accent text-lg font-bold text-accent-foreground">
                {ad.seller?.name?.charAt(0) ?? 'ت'}
              </span>
              <div>
                <div className="flex items-center gap-1 font-semibold">
                  {ad.seller?.name}
                  {ad.seller?.trusted && <BadgeCheck className="h-4 w-4 text-primary" />}
                </div>
                {ad.seller?.memberSince && (
                  <div className="text-xs text-muted-foreground">عضو منذ {timeAgo(ad.seller.memberSince)}</div>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {waNumber ? (
                <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="block">
                  <Button variant="whatsapp" className="w-full"><MessageCircle className="h-4 w-4" /> واتساب</Button>
                </a>
              ) : null}
              {ad.seller?.phone ? (
                <a href={`tel:${ad.seller.phone}`} className="block">
                  <Button variant="outline" className="w-full"><Phone className="h-4 w-4" /> اتصال</Button>
                </a>
              ) : null}
              {!waNumber && !ad.seller?.phone && (
                <Link href="/login" className="block">
                  <Button variant="outline" className="w-full">سجّل الدخول لعرض وسائل التواصل</Button>
                </Link>
              )}
            </div>
          </div>

          <DisclaimerBar variant="full" />
        </aside>
      </div>
    </div>
  );
}
