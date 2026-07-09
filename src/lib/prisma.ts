import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * حوض الاتصالات: افتراضي Prisma صغير على خادم بأنوية قليلة (يُشبع بسرعة عند
 * تنقّل الإدارة بين الأقسام فيعلق الموقع). نرفعه ومهلة الانتظار ما لم يحدَّد
 * في DATABASE_URL صراحةً.
 */
function poolUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  if (/[?&]connection_limit=/.test(raw)) return raw;
  const sep = raw.includes('?') ? '&' : '?';
  return `${raw}${sep}connection_limit=15&pool_timeout=30`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: poolUrl() ? { db: { url: poolUrl() } } : undefined,
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
