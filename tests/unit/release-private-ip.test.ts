import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
describe('private isolated test tunnel', () => {
  it.each(['192.168.0.4', '172.18.0.4', '10.1.2.3'])('accepts Docker private address %s', ip => {
    expect(spawnSync(process.execPath, ['scripts/release/private-test-ip.cjs', ip]).status).toBe(0);
  });
  it.each(['8.8.8.8', '127.0.0.1', '172.32.0.1', '192.168.0.999', '192.168.0.4;echo unsafe', ''])('rejects non-private or invalid target %s', ip => {
    expect(spawnSync(process.execPath, ['scripts/release/private-test-ip.cjs', ip]).status).toBe(1);
  });
});
