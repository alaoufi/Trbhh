'use strict';

const IDENTIFIER = /^[A-Za-z0-9_]{1,64}$/;
const PASSWORD = /^[A-Za-z0-9]{12,128}$/;
const FORBIDDEN_GRANTS = /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRIGGER|EXECUTE|FILE|PROCESS|SUPER|RELOAD|SHUTDOWN|GRANT OPTION)\b/i;

function checkedIdentifier(value, label) {
  if (!IDENTIFIER.test(value || '')) throw new Error(`preview_readonly_invalid_${label}`);
  return value;
}

function buildStatements({ database, username, password }) {
  const db = checkedIdentifier(database, 'database');
  const user = checkedIdentifier(username, 'username');
  if (!PASSWORD.test(password || '')) throw new Error('preview_readonly_invalid_password');
  const principal = `'${user}'@'%'`;
  return [
    `CREATE USER IF NOT EXISTS ${principal} IDENTIFIED BY '${password}'`,
    `ALTER USER ${principal} IDENTIFIED BY '${password}'`,
    `REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${principal}`,
    `GRANT SELECT, SHOW VIEW ON \`${db}\`.* TO ${principal}`,
  ];
}

function validateGrantReport(grants, database) {
  const db = checkedIdentifier(database, 'database').toLowerCase();
  const normalized = grants.map((grant) => String(grant).toUpperCase());
  if (normalized.some((grant) => FORBIDDEN_GRANTS.test(grant))) return false;
  return normalized.some((grant) => {
    const lower = grant.toLowerCase();
    return lower.includes('select') && lower.includes('show view') && lower.includes(`\`${db}\`.*`);
  });
}

function emitSql({ database, username, password }) {
  return `${buildStatements({ database, username, password }).join(';\n')};\n`;
}

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const parsed = new URL(process.env.DATABASE_URL || '');
  if (parsed.protocol !== 'mysql:') throw new Error('preview_readonly_database_url');
  const database = decodeURIComponent(parsed.pathname.slice(1));
  const username = process.env.PREVIEW_READONLY_USER || '';
  const password = process.env.PREVIEW_READONLY_PASSWORD || '';
  const statements = buildStatements({ database, username, password });
  const prisma = new PrismaClient();
  try {
    for (const statement of statements) await prisma.$executeRawUnsafe(statement);
    const grants = await prisma.$queryRawUnsafe(`SHOW GRANTS FOR '${username}'@'%'`);
    const grantLines = grants.flatMap((row) => Object.values(row).map(String));
    if (!validateGrantReport(grantLines, database)) throw new Error('preview_readonly_grants_rejected');
    process.stdout.write(`${JSON.stringify({ database, username, readOnly: true })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { buildStatements, emitSql, validateGrantReport };
if (require.main === module) {
  if (process.argv.includes('--emit-sql')) {
    try {
      process.stdout.write(emitSql({
        database: process.env.PREVIEW_DATABASE || '',
        username: process.env.PREVIEW_READONLY_USER || '',
        password: process.env.PREVIEW_READONLY_PASSWORD || '',
      }));
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'preview_readonly_failed');
      process.exitCode = 1;
    }
  } else {
    main().catch((error) => {
      console.error(error instanceof Error ? error.message : 'preview_readonly_failed');
      process.exitCode = 1;
    });
  }
}
