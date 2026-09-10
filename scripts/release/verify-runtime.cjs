const fs = require('node:fs');
const assert = require('node:assert/strict');
const [beforePath, afterPath] = process.argv.slice(2);
const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'))[0];
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'))[0];
const env = (c) => Object.fromEntries(c.Config.Env.map((v) => { const at = v.indexOf('='); return [v.slice(0, at), v.slice(at + 1)]; }));
const first = env(before); const last = env(after);
for (const key of ['DATABASE_URL', 'AUTH_SECRET', 'STORAGE_DIR', 'LEGACY_LOCAL_DIR']) {
  if (first[key] !== last[key]) { console.error(`Runtime preservation check failed for ${key}; values withheld.`); process.exit(1); }
}
const mounts = (c) => c.Mounts.map(({ Type, Name, Source, Destination, RW }) => ({ Type, Name, Source, Destination, RW })).sort((a, b) => a.Destination.localeCompare(b.Destination));
try { assert.deepEqual(mounts(before), mounts(after)); }
catch { console.error('Production mounts changed; details withheld.'); process.exit(1); }
console.info('Production database connection, signing secret and storage mounts unchanged.');
