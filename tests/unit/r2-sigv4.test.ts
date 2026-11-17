import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { encodeKeyPath, r2Config, sigV4 } from '@/lib/r2';

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
