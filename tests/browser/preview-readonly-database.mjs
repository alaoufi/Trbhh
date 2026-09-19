// Disposable local MySQL only; never accepts a production URL.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { assertSelectOnlyGrants } from '../../src/lib/preview-grants.ts';
const url=new URL(process.env.PREVIEW_TEST_ADMIN_URL || '');
assert.equal(url.hostname,'127.0.0.1');
assert.equal(url.port,'33309');
assert.equal(url.pathname,'/trbhh_style_test');
const admin=new PrismaClient({datasources:{db:{url:url.href}}});
const roUrl=new URL(url);
roUrl.username='preview_ro_test'; roUrl.password='disposable_preview_only';
const ro=new PrismaClient({datasources:{db:{url:roUrl.href}}});
try {
 await admin.$executeRawUnsafe("CREATE USER IF NOT EXISTS 'preview_ro_test'@'%' IDENTIFIED BY 'disposable_preview_only'");
 await admin.$executeRawUnsafe("GRANT SELECT ON trbhh_style_test.* TO 'preview_ro_test'@'%'");
 const grants=await ro.$queryRawUnsafe('SHOW GRANTS FOR CURRENT_USER');
 const roles=await ro.$queryRawUnsafe('SELECT CURRENT_ROLE() AS role');
 assertSelectOnlyGrants(grants.flatMap(Object.values),'trbhh_style_test',roles[0].role);
 await ro.$queryRawUnsafe('SELECT COUNT(*) FROM ads');
 await assert.rejects(ro.$executeRawUnsafe('UPDATE ads SET id=id WHERE 1=0'));
 const full=await admin.$queryRawUnsafe('SHOW GRANTS FOR CURRENT_USER');
 assert.throws(()=>assertSelectOnlyGrants(full.flatMap(Object.values),'trbhh_style_test','NONE'));
 console.log('PASS: real SELECT-only MySQL reads, write denied, privileged credentials rejected');
} finally {
 await ro.$disconnect();
 await admin.$executeRawUnsafe("DROP USER IF EXISTS 'preview_ro_test'@'%'");
 await admin.$disconnect();
}
