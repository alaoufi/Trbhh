"""One-shot CSS-only release, preserving the original container and timed rollback."""
import importlib.util
import json
import pathlib
import subprocess
import sys

BASE = '0d4d2bda28c7980c360e410d61cc164a4d071e96'
CANDIDATE = '557032ff3a870c7af7206e02b23e430549bc20de'
IMAGE = 'sha256:a633af3f51936d69267f46feb5307aa0eba30f6081ce03c78fa3f4b00668319d'
RUN = 'wide-card-557032ff'
BACKUP = pathlib.Path('/root/trbhh-release-backups') / RUN
spec = importlib.util.spec_from_file_location('cutover', pathlib.Path(__file__).with_name('final-gate-cutover.py'))
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)
common.CANDIDATE = CANDIDATE


def validate_original(original, current):
    if (current['Id'] != original['Id'] or current['Image'] != original['Image']
            or current['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != BASE):
        raise ValueError('Production no longer matches the backup')


def validate_changes(changes):
    if set(changes.splitlines()) != {'src/components/home-dense-feed.module.css'}:
        raise ValueError('Not the expected CSS-only release')


def smoke():
    for route in ('/', '/search', '/login', '/companies'):
        code = subprocess.check_output([
            'curl', '--fail', '--silent', '--show-error', '--retry', '5',
            '--retry-delay', '2', '--retry-all-errors', '--max-time', '20',
            '--output', '/dev/null', '--write-out', '%{http_code}', 'https://trbhh.sa' + route
        ], text=True).strip()
        if code != '200':
            raise RuntimeError('Public smoke failed')
        print(route + ' HTTP ' + code, flush=True)


def validate_candidate():
    current = common.inspect('trbhh-app')
    labels = current['Config'].get('Labels', {})
    if (current['Image'] != IMAGE or not current['State']['Running']
            or labels.get('org.opencontainers.image.revision') != CANDIDATE
            or labels.get('trbhh.final-release') != RUN):
        raise ValueError('Unexpected running release')


def promote():
    for marker in ('PROMOTION_STARTED', 'ROLLED_BACK', 'RELEASE_CONFIRMED'):
        if (BACKUP / marker).exists():
            raise ValueError('Release already attempted')
    subprocess.run(['sha256sum', '--check', '--status', 'SHA256SUMS'], cwd=BACKUP, check=True)
    original = json.loads((BACKUP / 'production-container.json').read_text())[0]
    validate_original(original, common.inspect('trbhh-app'))
    if (BACKUP / 'production-image.txt').read_text().strip() != original['Image']:
        raise ValueError('Backup image mismatch')
    changes = subprocess.check_output([
        'git', '-C', '/root/trbhh-staging', 'diff', '--name-only', BASE, CANDIDATE,
        '--', 'src', 'prisma', 'Dockerfile', 'package.json', 'pnpm-lock.yaml', 'next.config.mjs'
    ], text=True)
    validate_changes(changes)
    built = common.api('GET', '/images/' + IMAGE + '/json')
    if built['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != CANDIDATE:
        raise ValueError('Image revision mismatch')
    gate = """
const {PrismaClient}=require('@prisma/client'); const db=new PrismaClient({log:[]});
(async()=>{const flags=await db.$queryRawUnsafe("SELECT v FROM site_settings WHERE k='commerce_purchasing_enabled'");
if(flags.some(r=>['1','true','on'].includes(String(r.v).toLowerCase())))throw Error();
console.log('PURCHASING_OFF');})().catch(()=>{console.error('PURCHASING_GATE_FAILED');process.exitCode=1}).finally(()=>db.$disconnect());
"""
    subprocess.run(['docker', 'exec', '-i', original['Id'], 'node'], input=gate, text=True, check=True)
    subprocess.run(['systemd-run', '--unit=trbhh-release-watchdog-' + RUN, '--on-active=20m',
                    '/usr/bin/python3', str(pathlib.Path(__file__).resolve()), 'rollback'], check=True)
    (BACKUP / 'PROMOTION_STARTED').write_text(CANDIDATE + '\n')
    try:
        common.api('POST', '/containers/' + original['Id'] + '/stop?t=15')
        common.api('POST', '/containers/' + original['Id'] + '/rename?name=trbhh-rollback-' + RUN)
        created = common.api('POST', '/containers/create?name=trbhh-app', common.candidate_config(original, IMAGE, RUN))
        common.api('POST', '/containers/' + created['Id'] + '/start')
        validate_candidate()
        smoke()
        print('PROMOTED_PENDING_VISUAL_CONFIRMATION sha=' + CANDIDATE)
        print('Automatic rollback in 20 minutes unless confirmed.')
    except BaseException:
        common.rollback(BACKUP, RUN)
        raise


def main():
    import fcntl
    if not BACKUP.is_dir() or BACKUP.is_symlink():
        raise ValueError('Backup missing')
    with (BACKUP / 'operation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        mode, = sys.argv[1:]
        if mode == 'promote':
            promote()
        elif mode == 'rollback':
            common.rollback(BACKUP, RUN)
        elif mode == 'confirm':
            if not (BACKUP / 'PROMOTION_STARTED').exists() or (BACKUP / 'ROLLED_BACK').exists():
                raise ValueError('Release not pending')
            try:
                validate_candidate()
                smoke()
            except BaseException:
                common.rollback(BACKUP, RUN)
                raise
            (BACKUP / 'RELEASE_CONFIRMED').write_text(CANDIDATE + '\n')
            print('RELEASE_CONFIRMED sha=' + CANDIDATE)
        else:
            raise ValueError('Unsupported operation')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('RELEASE_OPERATION_FAILED type=' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
