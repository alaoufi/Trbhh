'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function check(ok, code) { if (!ok) throw new Error(code); }

try {
  const resultPath = process.argv[2];
  check(typeof resultPath === 'string' && /^\/root\/trbhh-release-backups\/archive-cleanup-[1-9][0-9]{0,19}\.json$/.test(resultPath), 'result_path');
  const resultInfo = fs.lstatSync(resultPath);
  check(resultInfo.isFile() && !resultInfo.isSymbolicLink() && resultInfo.nlink === 1 && (resultInfo.mode & 0o077) === 0, 'result_file');
  check(fs.realpathSync(resultPath) === resultPath, 'result_realpath');
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  check(result.mode === 'cleanup' && result.retentionDays === 365 && Array.isArray(result.legacyFiles), 'result_content');
  check(result.legacyFiles.length <= 20000, 'candidate_limit');

  const containerId = execFileSync('docker', ['compose', 'ps', '-q', 'app'], { cwd: '/root/trbhh', encoding: 'utf8' }).trim();
  check(/^[a-f0-9]{12,64}$/.test(containerId), 'app_container');
  const [container] = JSON.parse(execFileSync('docker', ['inspect', containerId], { encoding: 'utf8' }));
  check(container.State?.Running === true && container.State?.Paused === false, 'app_state');
  const mount = container.Mounts.find((entry) => entry.Destination === '/app/legacy');
  check(mount?.Type === 'bind' && mount.RW === false && path.isAbsolute(mount.Source), 'legacy_mount');
  const root = path.resolve(mount.Source);
  check(root !== '/' && fs.realpathSync(root) === root, 'legacy_root');
  const dockerRoot = execFileSync('docker', ['info', '--format', '{{.DockerRootDir}}'], { encoding: 'utf8' }).trim();
  const dockerRootReal = fs.realpathSync(dockerRoot);
  check(root !== dockerRootReal && !root.startsWith(dockerRootReal + path.sep), 'legacy_not_docker_root');

  const targets = [];
  for (const rel of [...new Set(result.legacyFiles)]) {
    check(typeof rel === 'string' && /^(file_upload|uploads|images)\/[A-Za-z0-9._-]+$/.test(rel), 'relative_file');
    const target = path.resolve(root, rel);
    check(target.startsWith(root + path.sep), 'target_path');
    let info;
    try {
      check(fs.realpathSync(target) === target, 'target_realpath');
      info = fs.lstatSync(target);
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
    check(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'target_file');
    fs.accessSync(path.dirname(target), fs.constants.W_OK);
    targets.push({ target, rel, size: info.size });
  }

  let deletedFiles = 0;
  let bytesDeleted = 0;
  for (const { target, size } of targets) {
    let current;
    try {
      current = fs.lstatSync(target);
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
    check(current.isFile() && !current.isSymbolicLink() && current.nlink === 1 && fs.realpathSync(target) === target, 'target_changed');
    fs.unlinkSync(target);
    deletedFiles++;
    bytesDeleted += size;
  }

  fs.unlinkSync(resultPath);
  process.stdout.write(JSON.stringify({ status: 'ok', adsDeleted: result.adsDeleted,
    photosDeleted: result.photosDeleted, uploadRowsDeleted: result.adUploadRowsDeleted,
    storageFilesDeleted: result.filesDeleted, storageBytesDeleted: result.bytesDeleted,
    legacyFilesDeleted: deletedFiles, legacyBytesDeleted: bytesDeleted }) + '\n');
} catch {
  process.stderr.write('Legacy media cleanup failed safely; inspect the protected maintenance result before retry.\n');
  process.exitCode = 1;
}
