export function isSaudiShippingArea(
  area: { city_id: number } | null,
  region: { id: bigint; country_id: number } | null,
  country: { id: number; name: string; key: string | null } | null,
) {
  return !!area && !!region && !!country && area.city_id === Number(region.id) && region.country_id === country.id
    && (country.key?.replace(/\D/g, '') === '966' || /^(السعودية|المملكة العربية السعودية|Saudi Arabia)$/i.test(country.name.trim()));
}
