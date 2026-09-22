import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({guard:vi.fn(),update:vi.fn()}));
vi.mock('@/lib/access-control/store',()=>({withUnassignedAccountChange:mocks.guard}));
vi.mock('@/lib/prisma',()=>({prisma:{users:{update:mocks.update}}}));
vi.mock('@/lib/auth',()=>({hashPassword:async()=> 'hashed-fixture'}));
import {sendNewPasswordToUser} from '@/lib/sms';
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('cannot reset or deliver a password once the target has a staff assignment',async()=>{
  const network=vi.fn();vi.stubGlobal('fetch',network);
  mocks.guard.mockRejectedValueOnce(Error('rbac_remove_roles_first'));
  await expect(sendNewPasswordToUser(7)).resolves.toMatchObject({ok:false,error:expect.stringContaining('إزالة أدوار الإدارة')});
  expect(mocks.guard).toHaveBeenCalledWith(expect.anything(),7,expect.any(Function));
  expect(mocks.update).not.toHaveBeenCalled();expect(network).not.toHaveBeenCalled();
});
