'use strict';

const {randomUUID} = require('node:crypto');
const ACCOUNTS = [{id:1001n,userName:'preview'}, {id:1002n,userName:'preview-store'}];

function validateEnvironment(env) {
  if (env.PREVIEW_SANDBOX !== 'true') throw new Error('Sandbox mode required');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('Invalid sandbox database'); }
  if (url.protocol !== 'mysql:' || url.hostname !== 'preview-db'
    || url.pathname !== '/trbhh_preview_v2' || url.hash
    || (url.port && url.port !== '3306')
    || [...url.searchParams.keys()].some(key => !['connection_limit','pool_timeout','connect_timeout'].includes(key))) {
    throw new Error('Invalid sandbox database');
  }
  const hash = env.PREVIEW_LOGIN_HASH;
  if (typeof hash !== 'string' || hash.length !== 60 || !/^\$2[aby]\$(?:0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/.test(hash)) {
    throw new Error('Valid bcrypt hash required');
  }
  return hash;
}

async function resetPreviewLogin(prisma, env = process.env) {
  const password = validateEnvironment(env);
  await prisma.$transaction(async tx => {
    const databases = await tx.$queryRaw`SELECT DATABASE() AS \`database\``;
    if (databases.length !== 1 || databases[0].database !== 'trbhh_preview_v2') throw new Error('Sandbox database mismatch');
    const marker = await tx.site_settings.findUnique({where:{k:'preview_v2_seed'}});
    if (marker?.v !== '2026-09-19-v1') throw new Error('Sandbox seed marker missing');
    // Lock and compare exact names in JS; MySQL's default collation is case-insensitive.
    const rows = await tx.$queryRaw`SELECT id, userName, is_admin FROM users WHERE id IN (1001, 1002) ORDER BY id FOR UPDATE`;
    if (rows.length !== 2 || ACCOUNTS.some(account => !rows.some(row =>
      BigInt(row.id) === account.id && row.userName === account.userName && Number(row.is_admin) === 0))) {
      throw new Error('Synthetic sandbox accounts mismatch');
    }
    for (const account of ACCOUNTS) {
      const result = await tx.users.updateMany({
        where:{...account,is_admin:0},
        data:{password,auth_session_version:randomUUID()},
      });
      if (result.count !== 1) throw new Error('Synthetic sandbox account update failed');
    }
  });
}

async function main() {
  let prisma;
  try {
    validateEnvironment(process.env);
    const {PrismaClient} = require('@prisma/client');
    prisma = new PrismaClient({log:[]});
    await resetPreviewLogin(prisma);
    console.log('Synthetic sandbox login reset completed.');
  } catch {
    // Never print Prisma errors, environment values, hashes or credentials.
    console.error('Synthetic sandbox login reset failed.');
    process.exitCode = 1;
  } finally {
    if (prisma) {
      try { await prisma.$disconnect(); } catch { process.exitCode = 1; }
    }
  }
}

if (require.main === module || process.argv[1] === '-') void main();

module.exports = {resetPreviewLogin};
