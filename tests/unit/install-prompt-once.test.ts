import { describe, expect, it } from 'vitest';
import { dismissPrompt, promptDismissed } from '@/lib/prompt-policy';

const installKey = 'trbhh_install_v2';
function savedBrowser() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe('install prompt dismissal', () => {
  it('survives a fresh browsing session while keeping independent store prompts separate', () => {
    const browser = savedBrowser();
    dismissPrompt(installKey, () => browser, new Set());
    expect(promptDismissed(installKey, () => browser, new Set())).toBe(true);
    expect(promptDismissed('store_12_install', () => browser, new Set())).toBe(false);
  });
  it('still closes for this tab when browser persistence is blocked', () => {
    const blocked = () => { throw new Error('Storage is blocked'); };
    const memory = new Set<string>();
    expect(promptDismissed(installKey, blocked, memory)).toBe(false);
    expect(() => dismissPrompt(installKey, blocked, memory)).not.toThrow();
    expect(promptDismissed(installKey, blocked, memory)).toBe(true);
  });
});
