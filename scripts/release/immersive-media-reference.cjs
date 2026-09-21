'use strict';
// Bind the immersive home release to the exact checkpoint that deployed the
// current National Day homepage. The checkpoint already proves the complete
// historical media chain; this layer verifies its post-release DB, suppliers,
// runtime and media before referencing those immutable manifests.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { spawnSync } = require('node:child_process');
const national = require('./national-media-reference.cjs');
const selection = require('./selection-media-reference.cjs');
const supplier = require('./supplier-preservation-proof.cjs');
const media = require('./media-proof.cjs');
const { canonicalDirectory, readSmall, hashFile } = require('./merchant-media-reference.cjs');

const BASE = '/root/trbhh-release-backups';
const CHECKPOINT_ID = '35629850346';
const BASELINE = '6b9ad47c6ace6cc7a7c25fc0d04947a5eaece2fb';
const CURRENT = '9a64552faca2b99e63a0e915ea73fd0989336b86';
const CURRENT_IMAGE = 'sha256:11a18b460d1264a036384d1ec1b3bf055009055edbd19841a076f27e6729d6a3';
const hash = value => createHash('sha256').update(value).digest('hex');
function check(value) { if (!value) throw Error('immersive_media_reference_rejected'); }
const json = (directory, name) => JSON.parse(readSmall(path.join(directory, name)));
function directory(value, base, id) {
  check(value === path.join(base, `audit-${id}`));
  const owner = base === BASE ? 0 : process.getuid?.();
  canonicalDirectory(base, owner);
  canonicalDirectory(value, owner);
}
function childDirectory(child, base) {
  const id = path.basename(child).replace(/^audit-/, '');
  check(/^\d+$/.test(id) && id !== CHECKPOINT_ID);
  directory(child, base, id);
}
function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  check(!result.error && result.status === 0);
  return result.stdout.trim();
}
function inspectCheckpoint(checkpoint, base = BASE) {
  directory(checkpoint, base, CHECKPOINT_ID);
  const markers = {};
  for (const [name, expected] of [['VERIFIED', BASELINE], ['commit.txt', BASELINE], ['candidate.txt', CURRENT], ['DEPLOYMENT_VERIFIED', CURRENT]]) {
    const raw = readSmall(path.join(checkpoint, name));
    check(raw.toString().trim() === expected);
    markers[name] = hash(raw);
  }
  check(national.verify(checkpoint, base).ok === true);
  const beforeRaw = readSmall(path.join(checkpoint, 'container-before.json'));
  const afterRaw = readSmall(path.join(checkpoint, 'container-after.json'));
  const before = selection.container(beforeRaw);
  const after = selection.container(afterRaw);
  check(after.image === CURRENT_IMAGE);
  selection.sameRuntime(before, after, false);
  run('verify-runtime.cjs', [path.join(checkpoint, 'container-before.json'), path.join(checkpoint, 'container-after.json'), 'national_day']);
  const supplierBefore = json(checkpoint, 'supplier-before.json');
  const supplierAfter = json(checkpoint, 'supplier-after.json');
  const supplierResult = supplier.verify(supplierBefore, supplierAfter);
  check(supplierResult.ok === true);
  const databaseResult = JSON.parse(run('database-proof.cjs', ['verify', path.join(checkpoint, 'before.json'), path.join(checkpoint, 'after.json')]));
  check(databaseResult.ok === true && databaseResult.sameDatabase === true && databaseResult.failures.length === 0);
  const inherited = json(checkpoint, 'NATIONAL_MEDIA_REFERENCE.json');
  const mediaAfter = {};
  for (const item of inherited.media) {
    const old = json(checkpoint, `${item.label}-before.json`);
    const next = json(checkpoint, `${item.label}-after.json`);
    media.validateManifest(old);
    media.validateManifest(next);
    const result = media.verify(old, next);
    check(result.ok && media.verify(next, old).ok);
    mediaAfter[item.label] = hashFile(path.join(checkpoint, `${item.label}-after.json`));
  }
  const sumsRaw = readSmall(path.join(checkpoint, 'SHA256SUMS'));
  const archives = {};
  for (const line of sumsRaw.toString().trimEnd().split('\n')) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$/.exec(line);
    check(match && !Object.hasOwn(archives, match[2]));
    archives[match[2]] = match[1];
    check(hashFile(path.join(checkpoint, match[2])) === match[1]);
  }
  for (const name of ['database.sql.gz', 'code.tar.gz', 'image.tar.gz', 'NATIONAL_MEDIA_REFERENCE.json', 'REUSED_MEDIA_SOURCE', 'container-before.json', 'supplier-before.json', 'full-before.json', ...inherited.media.flatMap(item => [`${item.label}.path`, `${item.label}-before.json`])]) check(Object.hasOwn(archives, name));
  const proofNames = ['before.json', 'after.json', 'supplier-before.json', 'supplier-after.json', 'container-before.json', 'container-after.json', ...inherited.media.map(item => `${item.label}-after.json`)];
  const proofs = Object.fromEntries(proofNames.map(name => [name, hashFile(path.join(checkpoint, name))]));
  return { format: 'trbhh-immersive-media-reference-v1', checkpointId: CHECKPOINT_ID, checkpointPath: checkpoint, checkpointBaseline: BASELINE, checkpointDeployment: CURRENT, checkpointRuntimeImage: after.image, markers, checkpointSha256Sums: hash(sumsRaw), archives, proofs, mediaAfter, inheritedReferenceSha256: hashFile(path.join(checkpoint, 'NATIONAL_MEDIA_REFERENCE.json')), media: inherited.media };
}
function prepare(checkpoint, child, base = BASE) {
  childDirectory(child, base);
  const reference = inspectCheckpoint(checkpoint, base);
  check(!fs.existsSync(path.join(child, 'IMMERSIVE_MEDIA_REFERENCE.json')) && !fs.existsSync(path.join(child, 'REUSED_MEDIA_SOURCE')));
  selection.sameRuntime(selection.container(readSmall(path.join(checkpoint, 'container-after.json'))), selection.container(readSmall(path.join(child, 'container-before.json'))));
  for (const item of reference.media) for (const suffix of ['.path', '-before.json']) {
    const raw = readSmall(path.join(checkpoint, item.label + suffix));
    fs.writeFileSync(path.join(child, item.label + suffix), raw, { flag: 'wx', mode: 0o600 });
  }
  fs.writeFileSync(path.join(child, 'IMMERSIVE_MEDIA_REFERENCE.json'), `${JSON.stringify(reference)}\n`, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(child, 'REUSED_MEDIA_SOURCE'), `${CHECKPOINT_ID}\n`, { flag: 'wx', mode: 0o600 });
  return { ok: true, referencedMedia: reference.media.length };
}
function verify(child, base = BASE) {
  childDirectory(child, base);
  check(readSmall(path.join(child, 'REUSED_MEDIA_SOURCE')).toString().trim() === CHECKPOINT_ID);
  const saved = json(child, 'IMMERSIVE_MEDIA_REFERENCE.json');
  const current = inspectCheckpoint(path.join(base, `audit-${CHECKPOINT_ID}`), base);
  check(isDeepStrictEqual(saved, current));
  selection.sameRuntime(selection.container(readSmall(path.join(current.checkpointPath, 'container-after.json'))), selection.container(readSmall(path.join(child, 'container-before.json'))));
  for (const item of current.media) {
    check(hashFile(path.join(child, `${item.label}.path`)) === hashFile(path.join(current.checkpointPath, `${item.label}.path`)));
    check(hashFile(path.join(child, `${item.label}-before.json`)) === hashFile(path.join(current.checkpointPath, `${item.label}-before.json`)));
    check(!fs.existsSync(path.join(child, `${item.label}.tar.gz`)) && !fs.existsSync(path.join(child, `${item.label}-extracted`)));
  }
  return { ok: true, referencedMedia: current.media.length };
}
if (require.main === module) {
  try {
    const [mode, first, second, ...extra] = process.argv.slice(2);
    check(extra.length === 0);
    const result = mode === 'prepare' && first && second ? prepare(first, second) : mode === 'verify' && first && !second ? verify(first) : null;
    check(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('Immersive National Day checkpoint review failed; retain all backups. Private values withheld.\n');
    process.exitCode = 1;
  }
}
module.exports = { prepare, verify, inspectCheckpoint, CHECKPOINT_ID, BASELINE, CURRENT, CURRENT_IMAGE };
