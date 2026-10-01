import 'server-only';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type LocationPrivacyDb = Pick<PrismaClient, '$queryRaw' | '$executeRaw'> | Prisma.TransactionClient;

export function exactLocationConsent(value: FormDataEntryValue | null, hasCoordinates: boolean): boolean {
  return hasCoordinates && value === '1';
}

export async function setAdLocationPrivacy(db: LocationPrivacyDb, adId: bigint, showExact: boolean): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    INSERT INTO ad_location_privacy (ad_id, show_exact_location_publicly)
    VALUES (${adId}, ${showExact ? 1 : 0})
    ON DUPLICATE KEY UPDATE show_exact_location_publicly=VALUES(show_exact_location_publicly)
  `);
}

/** Missing legacy table/row means private, never public. */
export async function getAdLocationPrivacy(adId: bigint): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ show_exact_location_publicly: number }[]>(Prisma.sql`
    SELECT show_exact_location_publicly FROM ad_location_privacy WHERE ad_id=${adId} LIMIT 1
  `).catch(() => []);
  return rows[0]?.show_exact_location_publicly === 1;
}
