import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SizeReferenceGuide} from '@/components/size-reference-guide';
it('offers collapsed accessible reference tables without purchase controls',()=>{const html=renderToStaticMarkup(createElement(SizeReferenceGuide));expect(html).toContain('data-size-reference="general"');expect(html).not.toMatch(/<details[^>]*\bopen/);expect(html).toContain('أمريكي نسائي US');expect(html).toContain('أمريكي رجالي US');expect(html).toContain('أوروبي EU');expect(html).toContain('ليس جدول هذا المنتج');expect(html).not.toMatch(/<select|<input|<button/);});
