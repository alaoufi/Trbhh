import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),flag:vi.fn(),requireAccess:vi.fn(),setting:vi.fn(),entity:vi.fn(),field:vi.fn(),group:vi.fn(),remove:vi.fn(),toggle:vi.fn(),reorder:vi.fn(),entityToggle:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:vi.fn().mockResolvedValue({uid:7})}));
vi.mock('@/lib/access-control/guards',()=>({hasAccess:m.access,requireAccess:m.requireAccess}));
vi.mock('@/lib/settings',()=>({getSettingBool:m.flag,setSetting:m.setting}));
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('not_found');}}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/dynamic-ads/repository',()=>({createDynamicEntity:m.entity,createDynamicField:m.field,createDynamicGroup:m.group,deleteDynamicField:m.remove,reorderDynamicField:m.reorder,setDynamicEntityActive:m.entityToggle,setDynamicFieldActive:m.toggle}));
import {requireSmartAdsLab} from '@/lib/dynamic-ads/access';
import * as actions from '@/app/admin/smart-ads/actions';
beforeEach(()=>{vi.clearAllMocks();m.flag.mockResolvedValue(true);m.access.mockResolvedValue(false);m.requireAccess.mockResolvedValue({uid:7});});
describe('smart ad exact capability gates',()=>{
  it('user-management permission no longer grants lab access',async()=>{
    m.access.mockImplementation(async(_uid,module)=>module==='users');await expect(requireSmartAdsLab()).rejects.toThrow('not_found');
  });
  it('view is insufficient to create/edit and the feature flag always remains required',async()=>{
    m.access.mockImplementation(async(_uid,module,action)=>module==='smart_ads'&&action==='view');
    expect(await requireSmartAdsLab()).toMatchObject({uid:7});await expect(requireSmartAdsLab('create')).rejects.toThrow('not_found');await expect(requireSmartAdsLab('edit')).rejects.toThrow('not_found');
    m.access.mockResolvedValue(true);m.flag.mockResolvedValue(false);await expect(requireSmartAdsLab('create')).rejects.toThrow('not_found');
  });
  it.each([['setSmartAdsLabEnabledAction','edit'],['addDynamicEntityAction','create'],['addDynamicGroupAction','create'],['addDynamicFieldAction','create'],['toggleDynamicFieldAction','edit'],['deleteDynamicFieldAction','delete'],['reorderDynamicFieldAction','edit'],['toggleDynamicEntityAction','edit']] as const)('%s requires view plus %s before mutation',async(name,key)=>{
    m.requireAccess.mockImplementation(async(_module,action)=>{if(action===key)throw new Error('denied');return {uid:7};});
    await expect(actions[name](new FormData())).rejects.toThrow('denied');
    expect(m.requireAccess.mock.calls).toEqual([['smart_ads','view'],['smart_ads',key]]);
    for(const fn of [m.setting,m.entity,m.field,m.group,m.remove,m.toggle,m.reorder,m.entityToggle])expect(fn).not.toHaveBeenCalled();
  });
});
