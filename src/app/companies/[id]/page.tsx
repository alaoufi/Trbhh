import Image from 'next/image';
import { notFound } from 'next/navigation';
import { BadgeCheck, MapPin, Phone, MessageCircle, Building2 } from 'lucide-react';
import { getStore } from '@/lib/stores';
import { getMyAds } from '@/lib/account';
import { AdGrid } from '@/components/ad-card';
import { Button } from '@/components/ui/button';
import { DisclaimerBar } from '@/components/disclaimer';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getStore(Number(id));
  return { title: s?.name || 'صفحة الشركة' };
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getStore(Number(id));
  if (!s) notFound();
  const myAds = await getMyAds(s.userId);
  const active = myAds.filter((a) => a.status === 1).map((a) => ({ id: a.id, title: a.title, price: a.price, adsType: a.adsType, image: a.image, cityName: null, categoryName: null, createdAt: a.createdAt, special: a.special, views: 0, sellerName: null, sellerTrusted: false }));
  const wa = s.whatsapp?.replace(/[^\d]/g, '');
  return (
    <div className="space-y-4">
      <div className="card-3d rounded-xl p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-muted"><Image src={s.logo} alt={s.name} fill sizes="80px" className="object-cover" /></div>
          <div className="flex-1">
            <div className="flex items-center gap-1 text-xl font-bold">{s.name}{s.trusted && <BadgeCheck className="h-5 w-5 text-primary" />}</div>
            {s.address && <div className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{s.address}</div>}
          </div>
          <div className="flex gap-2">
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"><Button variant="whatsapp"><MessageCircle className="h-4 w-4" /> واتساب</Button></a>}
            {s.phone && <a href={`tel:${s.phone}`}><Button variant="outline"><Phone className="h-4 w-4" /> اتصال</Button></a>}
          </div>
        </div>
        {s.description && <p className="mt-4 whitespace-pre-line leading-7 text-foreground/90">{s.description}</p>}
      </div>

      {s.branches.length > 0 && (
        <div className="card-3d rounded-xl p-4">
          <h2 className="mb-2 flex items-center gap-2 font-bold"><Building2 className="h-4 w-4" /> الفروع</h2>
          <ul className="space-y-1 text-sm">
            {s.branches.map((b) => <li key={b.id} className="flex items-center gap-2"><MapPin className="h-3 w-3 text-muted-foreground" /> <b>{b.name}</b> {b.address && <span className="text-muted-foreground">— {b.address}</span>}</li>)}
          </ul>
        </div>
      )}

      <h2 className="text-lg font-bold">كتالوج الخدمات والمنتجات ({active.length})</h2>
      <AdGrid ads={active} />
      <DisclaimerBar />
    </div>
  );
}
