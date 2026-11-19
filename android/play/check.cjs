// Read-only check of the Google Play key: signs in with PLAY_SERVICE_ACCOUNT_JSON, opens an edit of
// each app, lists every track with its versions, then deletes the edit. Nothing in the store changes.
// Usage: PLAY_PACKAGE=app.haftastore.com,com.trbhh.app node android/play/check.cjs
const { accessToken, withEdit } = require('./play-api.cjs');

(async () => {
  const packages = (process.env.PLAY_PACKAGE || '').split(',').map(p => p.trim()).filter(Boolean);
  if (!packages.length) throw new Error('PLAY_PACKAGE is empty');
  const { token, email } = await accessToken();
  console.log(`Signed in to Google as ${email}`);
  let failed = 0;
  for (const packageName of packages) {
    try {
      await withEdit(token, packageName, async edit => {
        const { tracks = [] } = await edit.call('GET', '/tracks');
        console.log(`App ${packageName}: ${tracks.length} tracks`);
        for (const track of tracks) {
          const releases = (track.releases || []).map(r => `${r.name || '?'} [${(r.versionCodes || []).join(',')}] ${r.status}${r.userFraction ? ` ${Math.round(r.userFraction * 100)}%` : ''}`);
          console.log(`- ${track.track}: ${releases.join(' | ') || 'empty'}`);
        }
        return false; // read only: the edit is deleted, nothing is published
      });
      console.log(`OK ${packageName}: the key can manage releases of this app (nothing was changed)`);
    } catch (err) {
      failed += 1;
      console.error(`NOT OK ${packageName}: ${err.message}`);
      if (err.status === 403 || err.status === 401) console.error('The key is valid but has no access to this app in Play Console (Users and permissions).');
    }
  }
  if (failed) process.exit(1);
})().catch(err => { console.error(`NOT OK: ${err.message}`); process.exit(1); });
