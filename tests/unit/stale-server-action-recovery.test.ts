import { describe, expect, it } from 'vitest';
import * as chunkError from '../../src/lib/chunk-error';

describe('stale server action recovery', () => {
  it('recognises the Next.js error emitted when an open tab posts an action from an older deployment', () => {
    const recover = (chunkError as Record<string, unknown>).isStaleServerActionError;
    expect(typeof recover).toBe('function');
    expect((recover as (error: Error) => boolean)(new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.'))).toBe(true);
  });
});
