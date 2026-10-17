import {expect,it} from 'vitest';
import {isSizeField,familiarSizeLabel} from '@/lib/sizing/display';
it('labels explicit systems and audience without converting sizes',()=>{expect(familiarSizeLabel('US Women 7')).toBe('أمريكي نسائي (US) 7');expect(familiarSizeLabel('EU 38')).toBe('أوروبي (EU) 38');expect(familiarSizeLabel('US 7')).not.toMatch(/نسائي|رجالي|EU/);expect(familiarSizeLabel('38')).toBe('38');});
it('explains international apparel labels without inventing regional equivalents',()=>{expect(familiarSizeLabel('XL')).toBe('XL — كبير جدًا');expect(familiarSizeLabel('32x34')).toBe('32x34');expect(familiarSizeLabel('220V')).toBe('220V');expect(isSizeField('voltage')).toBe(false);expect(isSizeField('shoe_size')).toBe(true);});
