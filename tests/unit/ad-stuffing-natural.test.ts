import {describe,it,expect} from 'vitest';
import {isKeywordStuffing} from '@/domain/text';
describe('natural service descriptions',()=>{
 it('allows repeated service names with distinct specifications',()=>{
  expect(isKeywordStuffing('تأجير رافعات شوكية','رافعة شوكية كهربائية للمستودعات وزن طن واحد\nرافعة شوكية ديزل للمصانع حمولة ثلاثة أطنان\nرافعة شوكية جانبية للممرات الضيقة متوفرة بالرياض\nرافعة شوكية كبيرة للمواقع مع مشغل محترف')).toBe(false);
 });
 it('does not reject a long useful description solely because a trade word appears twelve times',()=>{
  expect(isKeywordStuffing('معدات للتأجير',Array.from({length:12},(_,i)=>`رافعات موديل ${i} متوفرة للاستخدام داخل المستودعات والمصانع مع الصيانة وخدمة التوصيل`).join('\n'))).toBe(false);
 });
 it('still rejects a repeated keyword block',()=>expect(isKeywordStuffing('رافعة شوكية', 'رافعة شوكية '.repeat(15))).toBe(true));
 it('still rejects a longer repeated phrase',()=>expect(isKeywordStuffing('خدمات نقل', 'رافعة شوكية متوفرة للإيجار '.repeat(12))).toBe(true));
});
