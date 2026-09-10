export const PROMPT_SESSION_KEY = 'trbhh_automatic_prompt_session';
export type PromptStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Only one automatic invitation may claim the current browsing session. */
export function claimPromptSession(storage: PromptStorage, key: string): boolean {
  const active = storage.getItem(PROMPT_SESSION_KEY);
  if (active && active !== key) return false;
  storage.setItem(PROMPT_SESSION_KEY, key);
  return true;
}

export function allowAutomaticPrompt(pathname: string): boolean {
  return !/^\/(?:admin|login|register|forgot|reset|verify|store-login|store-register|store-forgot|ads)(?:\/|$)/.test(pathname);
}

/** Read through a getter because browsers can throw even when accessing localStorage itself. */
export function promptDismissed(key: string, storage: () => PromptStorage, memory: ReadonlySet<string>): boolean {
  if (memory.has(key)) return true;
  try { return storage().getItem(key) === '1'; } catch { return false; }
}

export function dismissPrompt(key: string, storage: () => PromptStorage, memory: Set<string>): void {
  memory.add(key);
  try { storage().setItem(key, '1'); } catch { /* The tab still remembers the dismissal. */ }
}
