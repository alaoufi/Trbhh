import {describe,it,expect} from 'vitest';
import {isDuplicateAdText} from '@/domain/text';
const thresholds={title:90,detail:90};
describe('ad duplicate evidence',()=>{
 it('permits a common title when specifications differ',()=>expect(isDuplicateAdText('رافعة شوكية','كهربائية حمولة طن للمستودع','رافعة شوكية','ديزل حمولة خمسة أطنان للمصنع',thresholds)).toBe(false));
 it('permits shared shop boilerplate for different products',()=>expect(isDuplicateAdText('كرسي مكتب','التوصيل متاح داخل الرياض','طاولة طعام','التوصيل متاح داخل الرياض',thresholds)).toBe(false));
 it('blocks the same own ad text',()=>expect(isDuplicateAdText('رافعة كهربائية','موديل حديث بحالة ممتازة','رافعة كهربائية','موديل حديث بحالة ممتازة',thresholds)).toBe(true));
 it('does not accuse another seller based on short generic text',()=>expect(isDuplicateAdText('رافعة للإيجار','للإيجار بالرياض','رافعة للإيجار','للإيجار بالرياض',thresholds,true)).toBe(false));
 it('still blocks copied substantial text across members',()=>{const detail='رافعة كهربائية حمولة ثلاثة اطنان موديل حديث بحالة ممتازة مع صيانة دورية وتوصيل للمستودع';expect(isDuplicateAdText('رافعة كهربائية',detail,'رافعة كهربائية',detail,thresholds,true)).toBe(true);});
});
