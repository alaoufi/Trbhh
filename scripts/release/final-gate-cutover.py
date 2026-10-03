"""Promote an already-tested immutable image; retain the original container for rollback."""
import copy
import http.client
import json
import pathlib
import re
import socket
import subprocess
import sys

CANDIDATE = '86df544796c46a7bc075d7d76c9870cfb5ce0494'


class DockerConnection(http.client.HTTPConnection):
    def __init__(self):
        super().__init__('localhost', timeout=60)

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect('/var/run/docker.sock')


def api(method, path, payload=None):
    connection = DockerConnection()
    try:
        body = None if payload is None else json.dumps(payload)
        connection.request(method, path, body, {'Content-Type': 'application/json'})
        response = connection.getresponse()
        data = response.read()
        if response.status not in (200, 201, 204, 304):
            raise RuntimeError('Docker operation rejected: HTTP ' + str(response.status))
        return json.loads(data) if data else None
    finally:
        connection.close()


def inspect(name):
    return api('GET', '/containers/' + name + '/json')


def candidate_config(original, image, run):
    config = copy.deepcopy(original['Config'])
    # Never reuse an old container hostname or image tag that can move.
    config.pop('Hostname', None)
    config.pop('Domainname', None)
    config['Image'] = image
    env = dict(item.split('=', 1) for item in config['Env'])
    env.update(SUPPLIER_ALLOW_LIVE_ORDERS='false', TRBHH_PREVIEW_MODE='0', TRBHH_READ_ONLY_PREVIEW='0')
    config['Env'] = [key + '=' + value for key, value in env.items()]
    config['Labels'] = dict(config.get('Labels') or {})
    config['Labels'].update({'org.opencontainers.image.revision': CANDIDATE, 'trbhh.final-release': run})
    config['HostConfig'] = copy.deepcopy(original['HostConfig'])
    config['HostConfig']['AutoRemove'] = False
    config['NetworkingConfig'] = {'EndpointsConfig': {
        name: {'Aliases': ['app', 'trbhh-app']}
        for name in original['NetworkSettings']['Networks']
    }}
    return config


def rollback(backup, run):
    if (backup / 'RELEASE_CONFIRMED').exists():
        return
    original = json.loads((backup / 'production-container.json').read_text())[0]
    # If promotion never began there is nothing to roll back.
    if not (backup / 'PROMOTION_STARTED').exists():
        return
    old = inspect(original['Id'])
    if old['Name'] == '/trbhh-app':
        if not old['State']['Running']:
            api('POST', '/containers/' + original['Id'] + '/start')
        return
    try:
        current = inspect('trbhh-app')
    except RuntimeError:
        current = None
    if current and current['Id'] != original['Id']:
        if current['Config'].get('Labels', {}).get('trbhh.final-release') != run:
            raise RuntimeError('Refusing to replace an unrelated container')
        api('POST', '/containers/' + current['Id'] + '/stop?t=10')
        api('POST', '/containers/' + current['Id'] + '/rename?name=trbhh-failed-' + run)
    api('POST', '/containers/' + original['Id'] + '/rename?name=trbhh-app')
    api('POST', '/containers/' + original['Id'] + '/start')
    assert inspect('trbhh-app')['Image'] == original['Image']
    (backup / 'ROLLED_BACK').write_text(original['Image'] + '\n')
    print('ROLLBACK_RESTORED_ORIGINAL_CONTAINER')


def main():
    mode, run = sys.argv[1:]
    assert mode in ('promote', 'rollback', 'confirm') and re.fullmatch(r'\d+', run)
    backup = pathlib.Path('/root/trbhh-release-backups/final-' + run)
    assert backup.is_dir() and not backup.is_symlink()
    if mode == 'rollback':
        rollback(backup, run)
        return
    image = (backup / 'preview-image.txt').read_text().strip()
    assert (backup / 'preview-sha.txt').read_text().strip() == CANDIDATE
    assert (backup / 'SMOKE_PASSED_IMAGE').read_text().strip() == image
    if mode == 'confirm':
        current = inspect('trbhh-app')
        assert current['Image'] == image and current['State']['Running']
        assert (backup / 'PRODUCTION_SMOKE_PASSED').is_file()
        (backup / 'RELEASE_CONFIRMED').write_text(CANDIDATE + '\n')
        print('RELEASE_CONFIRMED sha=' + CANDIDATE + ' image=' + image)
        return
    assert not (backup / 'PROMOTION_STARTED').exists()
    subprocess.run(['sha256sum', '--check', '--status', 'SHA256SUMS'], cwd=backup, check=True)
    assert (backup / 'RESTORE_VERIFIED').is_file()
    original = json.loads((backup / 'production-container.json').read_text())[0]
    current = inspect('trbhh-app')
    assert current['Id'] == original['Id'] and current['Image'] == original['Image']
    assert inspect('trbhh-staging-app')['Image'] == image
    assert subprocess.check_output(['git', '-C', '/root/trbhh-staging', 'rev-parse', 'HEAD'], text=True).strip() == CANDIDATE
    # Refuse a purchasing-enabled database or pending legacy backfills before changing the app.
    gate = """
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient({log:[]});
(async()=>{
const flags=await db.$queryRawUnsafe("SELECT v FROM site_settings WHERE k='commerce_purchasing_enabled'");
if(flags.some(r=>r.v==='1'))throw Error('Purchasing enabled');
const receipts=await db.$queryRawUnsafe("SELECT COUNT(*) AS n FROM wallet_topups WHERE receipt_hash IS NOT NULL AND receipt_hash != '-' AND CHAR_LENGTH(receipt_hash)<100");
const moderation=await db.$queryRawUnsafe("SELECT COUNT(*) AS n FROM mod_log WHERE (ad_id IS NULL AND kind IN ('duplicate','duplicate_cross') AND snippet REGEXP '#[0-9]+') OR (action='banned' AND kind='content' AND snippet LIKE 'حظر إعلان نهائياً:%') OR (action='banned' AND kind='account' AND snippet='account deleted at owner request')");
if(Number(receipts[0].n)||Number(moderation[0].n))throw Error('Legacy backfill pending');
console.log('PRODUCTION_RUNTIME_GATES_PASS');
})().catch(()=>{console.error('PRODUCTION_RUNTIME_GATES_FAIL');process.exitCode=1}).finally(()=>db.$disconnect());
"""
    subprocess.run(['docker', 'exec', '-i', original['Id'], 'node'], input=gate, text=True, check=True)
    # A local watchdog survives a disconnected CI runner. Known smoke failures roll back immediately.
    subprocess.run(['systemd-run', '--unit=trbhh-release-watchdog-' + run, '--on-active=10m',
                    '/usr/bin/python3', str(pathlib.Path(__file__).resolve()), 'rollback', run], check=True)
    (backup / 'PROMOTION_STARTED').write_text(CANDIDATE + '\n')
    try:
        api('POST', '/containers/' + original['Id'] + '/stop?t=15')
        api('POST', '/containers/' + original['Id'] + '/rename?name=trbhh-rollback-' + run)
        created = api('POST', '/containers/create?name=trbhh-app', candidate_config(original, image, run))
        api('POST', '/containers/' + created['Id'] + '/start')
        assert inspect('trbhh-app')['Image'] == image
        (backup / 'candidate-container-id.txt').write_text(created['Id'] + '\n')
        print('PROMOTED_PENDING_SMOKE sha=' + CANDIDATE + ' image=' + image)
    except Exception:
        rollback(backup, run)
        raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Docker configuration contains secrets; never serialize payloads/exceptions.
        print('FINAL_GATE_OPERATION_FAILED type=' + type(error).__name__, file=sys.stderr)
        sys.exit(1)
