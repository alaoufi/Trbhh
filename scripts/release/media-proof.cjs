#!/usr/bin/env node
'use strict';

// Snapshot output contains private filenames, link targets and hashes. Keep it
// inside the protected backup directory; only verify's aggregate output is public.
// Directory timestamps/ownership are deliberately excluded. Existing file bytes,
// paths, types and symlink targets must remain intact; additional entries are OK.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { TextDecoder } = require('node:util');

const FORMAT = 'trbhh-media-proof-v1';
const utf8 = new TextDecoder('utf-8', { fatal: true });
class MediaProofError extends Error {}
function check(condition) { if (!condition) throw new MediaProofError(); }
function decode(bytes) { return utf8.decode(bytes); }
function safeRelative(value) {
  return typeof value === 'string' && value.length > 0 &&
    !/[\\\u0000-\u001f\u007f]/.test(value) && !path.posix.isAbsolute(value) &&
    !/^[A-Za-z]:/.test(value) && value.split('/').every((part) => part && part !== '.' && part !== '..');
}
function sameObject(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.mode === b.mode;
}
function unchangedFile(a, b) {
  return sameObject(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}
function stat(file) { return fs.lstatSync(file, { bigint: true }); }
function sameNativePath(a, b) {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
function canonicalDirectory(directory) {
  // Refuse symlinked ancestors as well as a symlinked directory itself.
  check(sameNativePath(fs.realpathSync.native(directory), directory));
}

function hashFile(file, previous) {
  // On Unix this also rejects a regular-file -> symlink swap before open. On
  // other platforms fstat/lstat identity checks still fail closed on a swap.
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const initial = fs.fstatSync(fd, { bigint: true });
    check(initial.isFile() && unchangedFile(previous, initial));
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytes = 0n;
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      hash.update(buffer.subarray(0, count));
      bytes += BigInt(count);
    }
    check(bytes === initial.size && bytes <= BigInt(Number.MAX_SAFE_INTEGER));
    check(unchangedFile(initial, fs.fstatSync(fd, { bigint: true })) && unchangedFile(initial, stat(file)));
    return { bytes: Number(bytes), sha256: hash.digest('hex') };
  } finally { fs.closeSync(fd); }
}

function snapshot(rootInput) {
  check(typeof rootInput === 'string' && path.isAbsolute(rootInput) && !rootInput.includes('\0'));
  const root = path.resolve(rootInput);
  check(root !== path.parse(root).root);
  const first = stat(root);
  check(first.isDirectory() && !first.isSymbolicLink());
  canonicalDirectory(root);
  const entries = [];
  function walk(directory, relative, before) {
    canonicalDirectory(directory);
    const names = fs.readdirSync(directory, { encoding: 'buffer' }).map(decode).sort();
    for (const name of names) {
      check(name && !name.includes('/') && !name.includes('\\'));
      const key = relative ? relative + '/' + name : name;
      check(safeRelative(key));
      const full = path.join(directory, name);
      const info = stat(full);
      if (info.isSymbolicLink()) {
        // Record the target, never resolve/open it (absolute and ../ targets can
        // safely be recorded without following them).
        const target = decode(fs.readlinkSync(full, { encoding: 'buffer' }));
        check(target.length > 0 && !target.includes('\0'));
        check(unchangedFile(info, stat(full)) && target === decode(fs.readlinkSync(full, { encoding: 'buffer' })));
        entries.push({ path: key, kind: 'symlink', target });
      } else if (info.isDirectory()) {
        entries.push({ path: key, kind: 'directory' });
        walk(full, key, info);
      } else if (info.isFile()) {
        entries.push({ path: key, kind: 'file', ...hashFile(full, info) });
      } else {
        // Sockets, FIFOs, devices and any unfamiliar file types are not evidence
        // that a complete media backup was taken.
        throw new MediaProofError();
      }
    }
    canonicalDirectory(directory);
    check(sameObject(before, stat(directory)));
  }
  walk(root, '', first);
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { format: FORMAT, capturedAt: new Date().toISOString(), entryCount: entries.length, entries };
}

function exactKeys(object, keys) {
  return object && typeof object === 'object' && !Array.isArray(object) &&
    Object.keys(object).length === keys.length && keys.every((key) => Object.hasOwn(object, key));
}
function validateManifest(value) {
  check(exactKeys(value, ['format', 'capturedAt', 'entryCount', 'entries']));
  check(value.format === FORMAT && typeof value.capturedAt === 'string' && Number.isFinite(Date.parse(value.capturedAt)));
  check(Array.isArray(value.entries) && Number.isSafeInteger(value.entryCount) && value.entryCount === value.entries.length);
  const byPath = new Map();
  for (const entry of value.entries) {
    check(entry && safeRelative(entry.path) && !byPath.has(entry.path));
    if (entry.kind === 'file') {
      check(exactKeys(entry, ['path', 'kind', 'bytes', 'sha256']));
      check(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 && typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256));
    } else if (entry.kind === 'symlink') {
      check(exactKeys(entry, ['path', 'kind', 'target']));
      check(typeof entry.target === 'string' && entry.target.length > 0 && !entry.target.includes('\0'));
    } else {
      check(entry.kind === 'directory' && exactKeys(entry, ['path', 'kind']));
    }
    byPath.set(entry.path, entry);
  }
  for (const entry of value.entries) {
    const slash = entry.path.lastIndexOf('/');
    if (slash !== -1) check(byPath.get(entry.path.slice(0, slash))?.kind === 'directory');
  }
  return byPath;
}
function readManifest(file) {
  check(typeof file === 'string' && file.length > 0);
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  validateManifest(value);
  return value;
}
function verify(before, after) {
  const oldEntries = validateManifest(before);
  const newEntries = validateManifest(after);
  let missing = 0;
  let changed = 0;
  let added = 0;
  for (const [key, original] of oldEntries) {
    const next = newEntries.get(key);
    if (!next) { missing++; continue; }
    if (original.kind !== next.kind ||
      (original.kind === 'file' && (original.bytes !== next.bytes || original.sha256 !== next.sha256)) ||
      (original.kind === 'symlink' && original.target !== next.target)) changed++;
  }
  for (const key of newEntries.keys()) if (!oldEntries.has(key)) added++;
  return { ok: missing === 0 && changed === 0, compared: oldEntries.size, missing, changed, added };
}
function main() {
  const [mode, first, second, ...extra] = process.argv.slice(2);
  check(extra.length === 0);
  if (mode === 'snapshot') {
    check(first && second === undefined);
    const value = snapshot(first);
    validateManifest(value);
    process.stdout.write(JSON.stringify(value) + '\n');
    return;
  }
  check(mode === 'verify' && first && second);
  const result = verify(readManifest(first), readManifest(second));
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!result.ok) process.exitCode = 1;
}

// Docker callers feed this file to `node - snapshot ROOT`. Node's stdin module
// has no require.main; keep normal require() side-effect free for fixture tests.
if (require.main === module || (process.argv[1] === '-' && module.id === '[stdin]')) {
  try { main(); }
  catch {
    // Neither filesystem exceptions nor malformed JSON may leak paths, hashes,
    // link targets or file contents into a public CI log.
    process.stderr.write('Media proof failed. No success evidence was produced; keep manifests private and stop verification.\n');
    process.exitCode = 1;
  }
}
module.exports = { snapshot, verify, validateManifest };
