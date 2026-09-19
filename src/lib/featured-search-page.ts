/** Page the concatenation of featured then ordinary rows without loading either
 * partition in full. Readers must share the same filters and stable ordering. */
export async function featuredSearchPage<T>(
  take: number,
  skip: number,
  countFeatured: () => Promise<number>,
  read: (featured: boolean, skip: number, take: number) => Promise<T[]>,
): Promise<T[]> {
  if (!Number.isSafeInteger(take) || take < 0 || !Number.isSafeInteger(skip)) throw new Error('invalid_search_page');
  if (take === 0) return [];
  const offset = Math.max(0, skip);
  const count = await countFeatured();
  const featuredTake = Math.min(take, Math.max(0, count - offset));
  const ordinaryTake = take - featuredTake;
  const [featured, ordinary] = await Promise.all([
    featuredTake ? read(true, offset, featuredTake) : Promise.resolve([]),
    ordinaryTake ? read(false, Math.max(0, offset - count), ordinaryTake) : Promise.resolve([]),
  ]);
  return [...featured, ...ordinary];
}
