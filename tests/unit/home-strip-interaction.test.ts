import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const source=readFileSync(path.resolve(__dirname,'../../src/components/home-strip-scroller.tsx'),'utf8');
it('does not permanently pause autoplay when the visitor scrolls or touches the strip',()=>{
 expect(source).not.toContain('onTouchStart={()=>setPaused(true)}');
 expect(source).not.toContain('onWheel={()=>setPaused(true)}');
 expect(source).toContain('onTouchEnd=');
 expect(source).toContain('onTouchCancel=');
 expect(source).toContain('resumeAt.current');
 expect(source).toContain("e.pointerType==='mouse'");
 expect(source).toContain("matches(':focus-visible')");
});
it('retains explicit pause and accessibility motion safeguards',()=>{
 expect(source).toContain('setPaused(v=>!v)');
 expect(source).toContain('prefers-reduced-motion: reduce');
 expect(source).toContain('!focus.current');
 expect(source).toContain('cancelAnimationFrame(frame)');
});
