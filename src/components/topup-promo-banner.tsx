import { getTopupPromo, getActiveTopupCampaign } from '@/lib/settings';
import { TopupCampaignBannerView } from '@/components/topup-campaign-banner-view';

export async function TopupPromoBanner() {
  const [promo, campaign] = await Promise.all([getTopupPromo().catch(() => ({ pct: 0, min: 0, first: 0 })), getActiveTopupCampaign().catch(() => null)]);
  if (!campaign) return null;
  return <TopupCampaignBannerView tiers={campaign.tiers} until={campaign.until} presentation={campaign.presentation} firstBonus={promo.first} />;
}
