import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';

describe('wide home card proportions',()=>{
  const css=readFileSync('src/components/home-dense-feed.module.css','utf8');
  it('keeps the wide card vertical and independent of the tallest row',()=>{
    expect(css).toMatch(/:nth-child\(9n\+3\)\s*\{[^}]*flex-direction:column/);
    expect(css).toMatch(/:nth-child\(9n\+3\)\s*\{[^}]*align-self:start/);
  });
  it('bounds the image height and displays the full image',()=>{
    expect(css).toMatch(/:nth-child\(9n\+3\)>div:first-child\s*\{[^}]*height:160px/);
    expect(css).toMatch(/:nth-child\(9n\+3\)>div:first-child img\s*\{[^}]*object-fit:contain/);
  });
});
