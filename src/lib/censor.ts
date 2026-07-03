import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';

const ensureTable = ensureSchema;

let cache: { list: string[]; re: RegExp | null; exp: number } = { list: [], re: null, exp: 0 };

function buildRegex(words: string[]): RegExp | null {
  const cleaned = words
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!cleaned.length) return null;
  // whole-word only: not preceded/followed by a letter or number
  try {
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:${cleaned.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  } catch {
    return null;
  }
}

/** Load the banned-words list (cached ~60s). Call before censorSync. */
export async function loadBanned(): Promise<void> {
  if (Date.now() < cache.exp && cache.list.length >= 0) return;
  try {
    await ensureTable();
    const rows = await prisma.banned_words.findMany({ select: { word: true } });
    const list = rows.map((r) => r.word).filter(Boolean);
    cache = { list, re: buildRegex(list), exp: Date.now() + 60_000 };
  } catch {
    cache = { list: [], re: null, exp: Date.now() + 60_000 };
  }
}

/** Redact whole banned words with black blocks. Requires loadBanned() first. */
export function censorSync(text: string | null | undefined): string {
  if (!text) return text ?? '';
  if (!cache.re) return text;
  return text.replace(cache.re, (m) => '█'.repeat(Math.max(3, [...m].length)));
}

/** Convenience: load + censor a single string. */
export async function censor(text: string | null | undefined): Promise<string> {
  await loadBanned();
  return censorSync(text);
}

export async function getBannedWords(): Promise<{ id: number; word: string }[]> {
  await ensureTable();
  const rows = await prisma.banned_words.findMany({ orderBy: { id: 'desc' } });
  return rows.map((r) => ({ id: Number(r.id), word: r.word }));
}

export async function addBannedWord(word: string) {
  await ensureTable();
  const w = word.trim().slice(0, 100);
  if (!w) return;
  await prisma.banned_words.create({ data: { word: w } });
  cache.exp = 0; // invalidate
}

export async function deleteBannedWord(id: number) {
  await ensureTable();
  await prisma.banned_words.deleteMany({ where: { id: BigInt(id) } });
  cache.exp = 0;
}
