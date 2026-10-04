import {beforeEach,describe,it,expect,vi} from 'vitest';
import {saveHelp} from '@/app/admin/help/actions';
import {HELP_STEPS,CATEGORY_HELP_SETTING} from '@/lib/category-help';
const mocks=vi.hoisted(()=>({auth:vi.fn(),readOnly:vi.fn(),save:vi.fn()}));
vi.mock('@/lib/roles',()=>({requireAction:mocks.auth}));
vi.mock('@/lib/read-only-preview',()=>({isReadOnlyPreview:mocks.readOnly}));
vi.mock('@/lib/settings',()=>({setSetting:mocks.save}));
vi.mock('@/lib/audit',()=>({logAdmin:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
const form=()=>{const fd=new FormData();fd.set('enabled','1');for(const s of HELP_STEPS)fd.set(s.key,s.caption);return fd;};
describe('help settings save',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({uid:1});mocks.readOnly.mockReturnValue(false);mocks.save.mockResolvedValue(undefined);});
 it('requires category edit authority',async()=>{
  mocks.auth.mockRejectedValue(new Error('denied'));
  await expect(saveHelp({message:''},form())).rejects.toThrow('denied');expect(mocks.save).not.toHaveBeenCalled();
 });
 it('never writes in read-only preview',async()=>{
  mocks.readOnly.mockReturnValue(true);await saveHelp({message:''},form());expect(mocks.save).not.toHaveBeenCalled();
 });
 it('rejects incomplete data without partial saves',async()=>{
  const fd=form();fd.delete('fields');expect((await saveHelp({message:''},fd)).message).toContain('لم يتم الحفظ');expect(mocks.save).not.toHaveBeenCalled();
 });
 it('saves one bounded setting only',async()=>{
  const fd=form();fd.set('DATABASE_URL','ignored');expect((await saveHelp({message:''},fd)).message).toContain('تم حفظ');
  expect(mocks.auth).toHaveBeenCalledWith('categories','edit');expect(mocks.save).toHaveBeenCalledTimes(1);expect(mocks.save.mock.calls[0][0]).toBe(CATEGORY_HELP_SETTING);expect(mocks.save.mock.calls[0][1]).not.toContain('DATABASE_URL');
 });
 it('reports storage failure instead of success',async()=>{
  mocks.save.mockRejectedValue(new Error('db'));expect((await saveHelp({message:''},form())).message).toContain('لم يتم الحفظ');
 });
});
