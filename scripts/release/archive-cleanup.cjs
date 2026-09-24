/* One-time archive cleanup for the live marketplace. Defaults to read-only audit.
 * Only ads already archived for more than the app's 180-day retention period
 * are eligible. Only ad uploads exclusively referenced by those ads are eligible. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const mode = process.argv[2] || 'audit';
const cutoff = Date.now() - 180 * 86400_000;
const storageRoot = path.resolve(process.env.STORAGE_DIR || '/app/storage');

function expiredArchiveRows(rows) {
  return rows.filter((row) => {
    if (!row.data_archive) return false;
    const time = new Date(row.data_archive).getTime();
    return Number.isFinite(time) && time < cutoff;
  });
}

async function plan(db) {
  const archived = await db.ads.findMany({
    where: { NOT: [{ data_archive: null }, { data_archive: '' }] },
    select: { id: true, data_archive: true },
  });
  const oldAds = expiredArchiveRows(archived);
  const adIds = oldAds.map((row) => row.id);
  const oldPhotos = adIds.length ? await db.photos.findMany({
    where: { other_id: { in: adIds } },
    select: { photo_path: true, other_id: true },
  }) : [];
  const archivedPhotoIds = [...new Set(oldPhotos.map((row) => /^\d+$/.test(row.photo_path) ? row.photo_path : null).filter(Boolean))];
  const oldAdUploads = await db.uploads.findMany({
    where: { type: 'ad', created_at: { lt: new Date(cutoff) } },
    select: { id: true, file_name: true, file_size: true },
  });
  const uploadIds = [...new Set([...archivedPhotoIds, ...oldAdUploads.map((row) => row.id.toString())])];
  if (!uploadIds.length) return { oldAds, oldPhotos, deleteUploads: [], keepReasons: {} };
  const idValues = uploadIds.map((id) => BigInt(id));
  const [uploads, allPhotoRefs, videos, users, stores, profiles, categories] = await Promise.all([
    db.uploads.findMany({ where: { id: { in: idValues }, type: 'ad' }, select: { id: true, file_name: true, file_size: true } }),
    db.photos.findMany({ where: { photo_path: { in: uploadIds } }, select: { photo_path: true, other_id: true } }),
    db.ads.findMany({ where: { video_path: { in: uploadIds } }, select: { video_path: true } }),
    db.users.findMany({ where: { photo_path: { in: uploadIds } }, select: { photo_path: true } }),
    db.stores.findMany({ where: { logo: { in: idValues } }, select: { logo: true } }),
    db.profiles.findMany({ where: { avatar: { in: uploadIds.map(Number) } }, select: { avatar: true } }),
    db.categories.findMany({ where: { photo_path: { in: uploadIds } }, select: { photo_path: true } }),
  ]);

  const candidateIds = new Set(uploads.map((row) => row.id.toString()));
  const candidatePaths = [...new Set(uploads.map((row) => row.file_name).filter((name) => typeof name === 'string' && name))];
  const samePathRows = candidatePaths.length ? await db.uploads.findMany({
    where: { file_name: { in: candidatePaths } },
    select: { id: true, file_name: true },
  }) : [];
  const protectedIds = new Set([
    ...allPhotoRefs.filter((row) => !adIds.some((id) => id === row.other_id)).map((row) => row.photo_path),
    ...videos.map((row) => row.video_path),
    ...users.map((row) => row.photo_path),
    ...stores.map((row) => row.logo.toString()),
    ...profiles.map((row) => String(row.avatar)),
    ...categories.map((row) => row.photo_path),
  ]);
  const protectedPaths = new Set(samePathRows.filter((row) => !candidateIds.has(row.id.toString())).map((row) => row.file_name));
  const referencedPhotoIds = new Set(allPhotoRefs.map((row) => row.photo_path));
  const oldArchivePhotoIds = new Set(archivedPhotoIds);
  const oldAgeOrphanIds = new Set(oldAdUploads.map((row) => row.id.toString()).filter((id) => !referencedPhotoIds.has(id)));
  const deleteUploads = uploads.filter((row) => {
    const id = row.id.toString();
    return (oldArchivePhotoIds.has(id) || oldAgeOrphanIds.has(id)) && !protectedIds.has(id) && row.file_name && !protectedPaths.has(row.file_name);
  });
  const keepReasons = {
    nonAdOrMissingUploadRows: Math.max(0, uploadIds.length - uploads.length),
    usedByOtherContent: uploads.filter((row) => protectedIds.has(row.id.toString())).length,
    sharedFilePath: uploads.filter((row) => protectedPaths.has(row.file_name)).length,
    oldOrphanAdUploads: oldAgeOrphanIds.size,
  };
  return { oldAds, oldPhotos, deleteUploads, keepReasons };
}

async function measureFiles(rows) {
  let fileCount = 0;
  let bytes = 0;
  for (const row of rows) {
    const rel = row.file_name;
    if (typeof rel !== 'string' || !/^uploads\/[A-Za-z0-9._-]+$/.test(rel)) continue;
    const abs = path.resolve(storageRoot, rel);
    if (!abs.startsWith(storageRoot + path.sep)) continue;
    try {
      const st = await fs.lstat(abs);
      if (st.isFile() && !st.isSymbolicLink()) { fileCount++; bytes += st.size; }
    } catch { /* missing files are reported through the DB row count */ }
  }
  return { fileCount, bytes };
}

async function main() {
  if (mode !== 'audit' && mode !== 'cleanup') throw new Error('mode');
  if (mode === 'audit') {
    const result = await plan(prisma);
    const files = await measureFiles(result.deleteUploads);
    console.log(JSON.stringify({ mode, retentionDays: 180, expiredArchivedAds: result.oldAds.length,
      photosOnExpiredAds: result.oldPhotos.length, orphanedAdUploadRows: result.deleteUploads.length,
      removableFiles: files.fileCount, removableBytes: files.bytes, protected: result.keepReasons }));
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const next = await plan(tx);
    const ids = next.oldAds.map((row) => row.id);
    const uploadIds = next.deleteUploads.map((row) => row.id);
    const photosDeleted = ids.length ? await tx.photos.deleteMany({ where: { other_id: { in: ids } } }) : { count: 0 };
    const adsDeleted = ids.length ? await tx.ads.deleteMany({ where: { id: { in: ids } } }) : { count: 0 };
    const uploadsDeleted = uploadIds.length ? await tx.uploads.deleteMany({ where: { id: { in: uploadIds }, type: 'ad' } }) : { count: 0 };
    return { ...next, photosDeleted: photosDeleted.count, adsDeleted: adsDeleted.count, uploadsDeleted: uploadsDeleted.count };
  }, { isolationLevel: 'Serializable', timeout: 120000 });

  let filesDeleted = 0;
  let bytesDeleted = 0;
  for (const row of result.deleteUploads) {
    const rel = row.file_name;
    if (typeof rel !== 'string' || !/^uploads\/[A-Za-z0-9._-]+$/.test(rel)) continue;
    // Re-check after DB commit so a file reused by another row/content is retained.
    const [stillUploaded, stillReferenced, exactExternalRefs, videoRefs, categoryRefs] = await Promise.all([
      prisma.uploads.count({ where: { file_name: rel } }),
      prisma.photos.count({ where: { photo_path: row.id.toString() } }),
      prisma.users.count({ where: { photo_path: rel } }),
      prisma.ads.count({ where: { video_path: rel } }),
      prisma.categories.count({ where: { photo_path: rel } }),
    ]);
    if (stillUploaded || stillReferenced || exactExternalRefs || videoRefs || categoryRefs) continue;
    const abs = path.resolve(storageRoot, rel);
    if (!abs.startsWith(storageRoot + path.sep)) continue;
    try {
      const st = await fs.lstat(abs);
      if (!st.isFile() || st.isSymbolicLink()) continue;
      await fs.unlink(abs);
      filesDeleted++;
      bytesDeleted += st.size;
    } catch { /* report successful row cleanup separately from media unlink */ }
  }
  console.log(JSON.stringify({ mode, retentionDays: 180, adsDeleted: result.adsDeleted,
    photosDeleted: result.photosDeleted, adUploadRowsDeleted: result.uploadsDeleted,
    filesDeleted, bytesDeleted, protected: result.keepReasons }));
}

main().catch((error) => {
  console.error(`archive cleanup failed: ${error && error.message ? error.message : 'unknown'}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
