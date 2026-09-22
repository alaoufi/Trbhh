export const SEARCH_FIXTURE_DATABASE = 'trbhh_search_visibility_test';

/** No ambient DATABASE_URL, alternate host, query overrides, or existing app DB. */
export function isolatedSearchUrl(raw: string | undefined): URL {
  let url: URL;
  try { url = new URL(raw ?? ''); } catch { throw new Error('Refusing non-isolated search DB'); }
  if (url.protocol !== 'mysql:' || url.hostname !== '127.0.0.1' || url.port !== '33309'
    || url.pathname !== `/${SEARCH_FIXTURE_DATABASE}` || url.username !== 'root'
    || !url.password || url.search || url.hash) throw new Error('Refusing non-isolated search DB');
  return url;
}

/** Extract only the ads table from Prisma's offline --from-empty SQL output. */
export function searchAdsDdl(sql: string): string {
  const statements = sql.match(/CREATE TABLE `ads` \([\s\S]*?\n\) DEFAULT CHARACTER SET [^;]+;/g);
  if (statements?.length !== 1) throw new Error('Missing or ambiguous Prisma ads fixture DDL');
  return statements[0];
}
