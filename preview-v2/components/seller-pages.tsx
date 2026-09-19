'use client';
// Demo fixtures stay in the standalone static preview, never in the root client graph.
import { listings, isLive } from '../lib/demo-data';
import { NewAdPage as LocalNewAdPage, SellerDashboard as LocalSellerDashboard, type SellerAd } from './preview-local-seller';
import './seller.css';
import './category-details.css';
import './single-page-ad.css';
export { SELLER_ADS_KEY, AD_DRAFT_KEY, type SellerAd } from './preview-local-seller';

const seedAds: SellerAd[] = isLive ? [] : [listings[6], listings[2], listings[7]].map((listing, index) => ({
  intent: 'offer', spec1: '', spec2: '', details: {}, id: `demo-${listing.id}`, sourceId: listing.id,
  title: listing.title, description: listing.description, price: String(listing.price), city: listing.city,
  category: listing.category, subcategory: listing.category === 'منزل وأثاث' ? (index === 0 ? 'أثاث مكتبي' : 'أثاث منزلي') : 'رياضة وهوايات',
  condition: listing.condition, images: listing.images, status: index === 2 ? 'paused' : 'active',
  createdAt: '2026-09-09T10:00:00.000Z',
}));
export function NewAdPage() { return <LocalNewAdPage seedAds={seedAds} demo />; }
export function SellerDashboard() { return <LocalSellerDashboard seedAds={seedAds} demo />; }
