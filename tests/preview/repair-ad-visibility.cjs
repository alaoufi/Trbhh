const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');

// Deliberately fixed disposable fixture destination; never inherit DATABASE_URL.
const url = new URL('mysql://root:local_disposable_root_only@127.0.0.1:33309/trbhh_commerce_preview_20260919');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '33309');
assert.equal(url.pathname, '/trbhh_commerce_preview_20260919');
const title = 'وظيفة محاسب — إعلان اختبار محلي';
const apply = process.argv.includes('--apply');
assert(process.argv.slice(2).every(arg => arg === '--apply' || arg === '--assert-visible'), 'Unknown argument');
const db = new PrismaClient({ datasourceUrl: url.href });
async function run() {
  await db.$transaction(async tx => {
    const [database] = await tx.$queryRaw`SELECT DATABASE() AS name`;
    assert.equal(database.name, 'trbhh_commerce_preview_20260919');
    const [ad] = await tx.$queryRaw`SELECT id,title,user_id,status,state FROM ads WHERE id=1 FOR UPDATE`;
    assert(ad, 'Synthetic ad 1 must exist');
    assert.equal(ad.id, 1n); assert.equal(ad.title, title); assert.equal(ad.user_id, 2n);
    const owner = await tx.users.findUnique({ where: { id: 2n }, select: { userName: true, name: true, phoneNumber: true } });
    assert.deepEqual(owner, { userName: 'commerce-preview-member', name: 'تجربة member', phoneNumber: '0500000002' });
    console.log(JSON.stringify({ phase: 'before', id: 1, owner: owner.userName, title: ad.title, status: ad.status, state: ad.state }));
    const [visibility] = await tx.$queryRaw`SELECT category_id,store_only,trbhh_until,created_at,data_archive FROM ads WHERE id=1`;
    console.log(JSON.stringify({ visibility }, (_, value) => typeof value === 'bigint' ? value.toString() : value));
    if (process.argv.includes('--assert-visible')) {
      assert.equal(ad.status, 1, 'Preview ad must be published');
      assert.equal(ad.state, '1', 'Preview ad must use public visibility state');
    }
    if (apply) {
      assert(['active', '1'].includes(ad.state), 'Unexpected fixture state');
      assert([0, 1].includes(ad.status), 'Unexpected fixture status');
      await tx.$executeRaw`UPDATE ads SET status=1,state='1' WHERE id=1 AND user_id=2 AND title=${title}`;
      const [after] = await tx.$queryRaw`SELECT status,state FROM ads WHERE id=1 AND user_id=2 AND title=${title}`;
      assert.deepEqual(after, { status: 1, state: '1' });
      console.log(JSON.stringify({ phase: 'after', id: 1, ...after }));
    }
  });
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
