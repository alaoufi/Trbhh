import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');

describe('Prisma MySQL enum defaults', () => {
  it('uses enum members rather than unquoted SQL defaults', () => {
    expect(schema).not.toContain('@default(dbgenerated("لا"))');
    expect(schema).toContain('report     comments_report @default(no)');
    expect(schema).toContain('report     reviews_report @default(no)');
  });
});
