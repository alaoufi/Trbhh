import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { canonicalQuery, encodeKeyPath, parseListXml, r2BackupConfig, r2Config, sigV4 } from '@/lib/r2';

describe('R2 request signing', () => {
  // متجه الاختبار الرسمي من AWS (get-vanilla): يثبت صحة خوارزمية التوقيع نفسها.
  it('matches the AWS SigV4 reference vector', () => {
    const auth = sigV4({
      method: 'GET', path: '/', headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      region: 'us-east-1', service: 'service', accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', amzDate: '20150830T123600Z',
    });
    expect(auth).toBe('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  });
  // متجه AWS المرجعي مع سلسلة استعلام (get-vanilla-query-order-key-case).
  it('matches the AWS reference vector with a query string', () => {
    const auth = sigV4({
      method: 'GET', path: '/', query: canonicalQuery({ Param2: 'value2', Param1: 'value1' }),
      headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      region: 'us-east-1', service: 'service', accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', amzDate: '20150830T123600Z',
    });
    expect(auth).toContain('Signature=b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500');
  });
  it('builds a sorted, encoded canonical query', () => {
    expect(canonicalQuery({ prefix: 'daily/a b', 'list-type': '2', 'max-keys': '1000' })).toBe('list-type=2&max-keys=1000&prefix=daily%2Fa%20b');
  });
  it('parses a bucket listing', () => {
    const xml = '<ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>daily/a&amp;b.tar.gpg</Key><LastModified>2026-11-19T03:17:00.000Z</LastModified><Size>1234</Size></Contents><Contents><Key>daily/c.json</Key><Size>20</Size></Contents><NextContinuationToken>tok==</NextContinuationToken></ListBucketResult>';
    const r = parseListXml(xml);
    expect(r.objects).toEqual([{ key: 'daily/a&b.tar.gpg', size: 1234, lastModified: '2026-11-19T03:17:00.000Z' }, { key: 'daily/c.json', size: 20, lastModified: '' }]);
    expect(r.next).toBe('tok==');
    expect(parseListXml('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>')).toEqual({ objects: [], next: null });
  });
  it('reads the backups bucket settings separately', () => {
    expect(r2BackupConfig({ R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_MEDIA_BUCKET: 'm' } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(r2BackupConfig({ R2_ACCOUNT_ID: 'a', R2_BACKUP_ACCESS_KEY_ID: 'k', R2_BACKUP_SECRET_ACCESS_KEY: 's', R2_BACKUP_BUCKET: 'b' } as unknown as NodeJS.ProcessEnv)?.bucket).toBe('b');
  });
  it('encodes object keys per segment', () => {
    expect(encodeKeyPath('uploads/a b(1).jpg')).toBe('uploads/a%20b%281%29.jpg');
    expect(encodeKeyPath('ads_fiie/صورة.webp')).toBe('ads_fiie/%D8%B5%D9%88%D8%B1%D8%A9.webp');
  });
  it('is enabled only when all four settings exist', () => {
    expect(r2Config({} as NodeJS.ProcessEnv)).toBeNull();
    expect(r2Config({ R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's' } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(r2Config({ R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_MEDIA_BUCKET: 'b' } as unknown as NodeJS.ProcessEnv)?.bucket).toBe('b');
  });
});
