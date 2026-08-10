import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VerifySeal } from '../../src/components/verify-seal';

describe('VerifySeal', () => {
  it('uses the provider-supported bottom position before the client repositions it to the header', () => {
    const html = renderToStaticMarkup(createElement(VerifySeal));

    expect(html).toContain('data-position="bottom-left"');
  });
});
