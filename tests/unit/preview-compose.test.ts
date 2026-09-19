import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const file = 'deploy/preview/compose.preview.json';
const config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};

describe('isolated preview deployment contract', () => {
  it('defines a distinct project with one loopback-only app, no production volumes', () => {
    expect(config.name).toBe('trbhh-preview');
    expect(Object.keys(config.services || {})).toEqual(['app']);
    expect(config.services.app.ports).toEqual(['127.0.0.1:4188:3000']);
    expect(config.services.app.volumes).toBeUndefined();
    expect(config.services.app.container_name).toBeUndefined();
    expect(config.services.app.network_mode).toBeUndefined();
  });

  it('requires explicit image, read-only database and independent secret without inherited env files', () => {
    const app = config.services?.app || {};
    expect(app.image).toMatch(/^\$\{TRBHH_PREVIEW_IMAGE:\?/);
    expect(app.env_file).toBeUndefined();
    expect(app.environment).toEqual({
      NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
      PREVIEW_READ_ONLY: 'true',
      DATABASE_URL: '${TRBHH_PREVIEW_DATABASE_URL:?Provide a SELECT-only preview database URL}',
      AUTH_SECRET: '${TRBHH_PREVIEW_AUTH_SECRET:?Provide an independent preview secret}',
      REDIS_URL: '', COOKIE_SECURE: 'true', TZ: 'Asia/Riyadh',
      HOSTNAME: '0.0.0.0', PORT: '3000',
    });
  });

  it('runs without privilege and caps resources, with ephemeral writable cache only', () => {
    const app = config.services?.app || {};
    expect(app.user).toBe('1001:1001');
    expect(app.read_only).toBe(true);
    expect(app.cap_drop).toEqual(['ALL']);
    expect(app.security_opt).toEqual(['no-new-privileges:true']);
    expect(app.mem_limit).toBe('1g');
    expect(app.cpus).toBe(1);
    expect(app.pids_limit).toBe(128);
    expect(app.tmpfs).toEqual([
      '/tmp:rw,noexec,nosuid,size=64m,uid=1001,gid=1001',
      '/app/.next/cache:rw,noexec,nosuid,size=128m,uid=1001,gid=1001',
    ]);
    expect(app.logging.options).toEqual({'max-size': '10m', 'max-file': '3'});
    expect(app.restart).toBe('no');
  });
});
