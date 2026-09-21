import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/release-safeguards.yml', 'utf8');
const script = readFileSync('scripts/release/safeguards.sh', 'utf8');
const runtime = readFileSync('scripts/release/verify-runtime.cjs', 'utf8');
const helper = readFileSync('scripts/release/loyalty-media-reference.cjs', 'utf8');
const baseline = 'a9f0c98731875ff95d451de5fe75ff42736ed01f';
const checkpoint = '35634930527';
const candidate = 'c'.repeat(40);
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const shell = (source: string, env: Record<string, string> = {}) => spawnSync(bash, ['-c', source], { encoding: 'utf8', timeout: 10000, env: { ...process.env, ...env } });

describe('National Day loyalty-copy production release', () => {
  it('selects the exact current-production checkpoint only on the feature branch', () => {
    const expression = workflow.match(/^          RELEASE_PROFILE: \$\{\{ (.+) \}\}$/m)?.[1];
    expect(expression).toBeDefined();
    for (const [ref, reuse, profile] of [
      ['codex/supplier-visual-selection-20260921', checkpoint, 'national_day_loyalty'],
      ['codex/supplier-visual-selection-20260921', '35629850346', 'national_day_immersive'],
      ['claude/hostinger-vps-project-amw8vb', checkpoint, 'standard'],
    ]) expect(runInNewContext(expression!, { github: { ref: `refs/heads/${ref}` }, inputs: { reuse_media_id: reuse } }, { timeout: 1000 })).toBe(profile);
  });

  it('rejects any other checkpoint or production baseline', () => {
    const prefix = script.slice(0, script.indexOf('\nprod=/root/trbhh'));
    expect(shell(`set -- before 999 ${candidate} ${checkpoint} national_day_loyalty\n${prefix}`).status).toBe(0);
    for (const reuse of ['35629850346', '123', "''"]) {
      expect(shell(`set -- before 999 ${candidate} ${reuse} national_day_loyalty\n${prefix}`).status).not.toBe(0);
    }
    const gate = script.match(/\nif \[\[ "\$release_profile" == salla \]\]; then\n[\s\S]*?\nfi\n(?=if \[\[ "\$release_profile" == merchant_oauth)/)?.[0];
    expect(gate).toBeDefined();
    expect(shell(gate!, { release_profile: 'national_day_loyalty', current_commit: baseline, reuse_media_id: checkpoint }).status).toBe(0);
    expect(shell(gate!, { release_profile: 'national_day_loyalty', current_commit: candidate, reuse_media_id: checkpoint }).status).not.toBe(0);
  });

  it('pins the reviewed parent and completes every proof before success', () => {
    expect(helper).toContain(`const CHECKPOINT_ID = '${checkpoint}'`);
    expect(helper).toContain(`const CURRENT = '${baseline}'`);
    expect(helper).toContain("immersive.verify(checkpoint, base).ok === true");
    expect(script).toContain(`== ${baseline} && "$(cat "$backup/commit.txt")" == ${baseline}`);
    expect(script).toContain('loyalty-media-reference.cjs" prepare');
    expect(script).toContain('loyalty-media-reference.cjs" verify');
    expect(script).toContain('LOYALTY_MEDIA_REFERENCE.json REUSED_MEDIA_SOURCE');
    const finish = script.indexOf('> "$backup/DEPLOYMENT_VERIFIED"');
    for (const proof of ['loyalty-media-reference.cjs" verify', 'verify "$backup/supplier-before.json" "$backup/supplier-after.json"', 'verify "$backup/before.json" "$backup/after.json"', 'verify-runtime.cjs" "$backup/container-before.json" "$backup/container-after.json"']) {
      expect(script.indexOf(proof)).toBeGreaterThan(-1);
      expect(script.indexOf(proof)).toBeLessThan(finish);
    }
  });

  it('keeps Salla credentials and purchasing disabled in runtime proof', () => {
    expect(runtime).toContain("'national_day_loyalty'");
    expect(runtime).toContain("first.SUPPLIER_ALLOW_LIVE_ORDERS!=='false'");
  });
});
