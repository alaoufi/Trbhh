/** One seasonal presentation window; Saudi Arabia uses UTC+03:00 throughout it. */
const START = Date.parse('2026-09-21T00:00:00+03:00');
const END = Date.parse('2026-09-25T00:00:00+03:00');

export function isNationalDayCampaignActive(now = Date.now()): boolean {
  return Number.isFinite(now) && now >= START && now < END;
}
