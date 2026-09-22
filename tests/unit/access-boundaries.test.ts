import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { permissionKeySet } from '@/lib/access-control/catalog';

function action(file: string, name: string) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const node = source.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  if (!node || !ts.isFunctionDeclaration(node) || !node.body) throw new Error(`Missing ${file}:${name}`);
  return node.body.getText(source);
}

describe('server capability boundaries', () => {
  it('every explicit server access gate exists in the shared registry',()=>{
    const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)):/\.tsx?$/.test(entry.name)?[join(dir,entry.name)]:[]);
    const invalid:string[]=[];
    for(const file of files('src/app')){
      const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
      const visit=(node:ts.Node)=>{
        if(ts.isCallExpression(node)&&['requireAccess','hasAccess'].includes(node.expression.getText(source))){
          const args=node.arguments.slice(node.expression.getText(source)==='hasAccess'?1:0);
          if(args[0]&&ts.isStringLiteral(args[0])&&(!args[1]||ts.isStringLiteral(args[1]))){
            const key=`${args[0].text}:${args[1]&&ts.isStringLiteral(args[1])?args[1].text:'view'}`;
            if(!permissionKeySet.has(key))invalid.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line+1} ${key}`);
          }
        }
        ts.forEachChild(node,visit);
      };
      visit(source);
    }
    expect(invalid).toEqual([]);
  });
  it.each([
    ['saveTextsAction', 'texts', 'edit'], ['saveSettingsAction', 'settings', 'manage_settings'],
    ['saveRevenueAction', 'pricing', 'manage_settings'], ['savePaymentSettingsAction', 'payments', 'manage_settings'],
    ['saveProviderCredsAction', 'payments', 'manage_settings'], ['saveVerificationAction', 'security', 'manage_settings'],
    ['approveTopupAction', 'topups', 'approve'], ['verifyOnlineTopupAction', 'topups', 'approve'],
    ['verifyVisibleOnlineTopupsAction', 'topups', 'approve'], ['cancelTopupAction', 'topups', 'refund'],
    ['addSiteExpenseAction', 'expenses', 'create'], ['deleteSiteExpenseAction', 'expenses', 'delete'],
    ['setUserPasswordAction', 'security', 'manage_settings'], ['sendUserPasswordAction', 'security', 'manage_settings'],
    ['adminToggleSpecialAction', 'promos', 'edit'],
    ['clearErrorLogAction', 'errors', 'delete'], ['adminDeleteNotifAction', 'notifications', 'delete'],
    ['approveStoreAction', 'stores', 'approve'], ['warnStoreAction', 'stores', 'suspend'],
    ['adminClearReadNotifsAction', 'notifications', 'delete'], ['addTopupCampaignAction', 'campaigns', 'create'],
  ])('%s requires %s:%s rather than member editing', (name, module, permission) => {
    expect(action('src/app/admin/actions.ts', name)).toMatch(new RegExp(`requireAccess\\('${module}',\\s*'${permission}'\\)`));
  });
  it('report resolution checks the extra capability before banning or deleting content', () => {
    const body = action('src/app/admin/actions.ts', 'resolveReportAction');
    expect(body).toMatch(/if \(action === 'ban' && ownerId\) \{\s*await requireAccess\('users', 'ban'\)/);
    expect(body).toMatch(/if \(action === 'delete' && ad\) \{\s*await requireAccess\('ads', 'delete'\)/);
  });
  it.each(['setUserPermsAction', 'applyPresetAction'])('retired %s cannot write legacy authorization tables', name => {
    const body = action('src/app/admin/actions.ts', name);
    expect(body).toContain("redirect('/admin/access-control')");
    expect(body).not.toMatch(/setUserPerms\(|applyRolePreset\(/);
  });
  it('wallet credit and refund are independently authorized', () => {
    expect(action('src/app/admin/actions.ts', 'adjustUserBalanceAction')).toMatch(/requireAccess\('wallets',\s*kind === 'debit' \? 'refund' : 'edit'\)/);
  });
  it('unrelated staff permissions never bypass classified ownership', () => {
    for (const [name, permission] of [['updateClassifiedAction', 'edit'], ['toggleClassifiedStatusAction', 'suspend'], ['deleteClassifiedFromDetailAction', 'delete']]) {
      const body = action('src/app/classified/actions.ts', name);
      expect(body).not.toContain('hasAnyAdmin');
      expect(body).toContain(`hasAccess(session.uid, 'classified', '${permission}')`);
    }
  });
  it('OAuth consent requires integration authorization, separately from supplier maintenance', () => {
    for (const file of ['invite', 'authorize', 'callback']) {
      const source = readFileSync(`src/app/api/integrations/salla/${file}/route.ts`, 'utf8');
      expect(source).toMatch(/hasAccess\([^\n]*'integrations',\s*'authorize'\)/);
      expect(source).not.toContain("'suppliers','edit'");
    }
  });
  it.each([
    ['src/app/classified/[id]/page.tsx','classified','view'],
    ['src/app/classified/[id]/edit/page.tsx','classified','edit'],
    ['src/app/companies/[id]/page.tsx','stores','view'],
    ['src/app/companies/[id]/p/[adId]/page.tsx','stores','view'],
  ])('hidden records in %s require their own module', (file, module, permission) => {
    const source=readFileSync(file,'utf8');
    expect(source).not.toContain('hasAnyAdmin');
    expect(source).toContain(`hasAccess(session.uid, '${module}', '${permission}')`);
  });
  it('moderation messaging and store suspension are independent grants',()=>{
    expect(action('src/app/admin/actions.ts','adminMessageAdOwnerAction')).toContain("requireAccess('messages', 'create')");
    expect(action('src/app/admin/actions.ts','adminMessageStoreOwnerAction')).toContain("requireAccess('messages', 'create')");
    expect(action('src/app/admin/actions.ts','adminHideStoreAdAction')).toContain("requireAccess('stores', 'suspend')");
  });
  it.each(['updateUserAction','setUserPasswordAction'])('%s serializes the final account write with role assignments',name=>{
    const body=action('src/app/admin/actions.ts',name);
    expect(body).toContain('withUnassignedAccountChange(prisma, uid,');
    expect(body).not.toContain('prisma.users.update(');
    expect(body).toContain('rbac_remove_roles_first');
  });
  it('delivered password resets use the locked row and send only after commit',()=>{
    const body=action('src/lib/sms.ts','sendNewPasswordToUser');
    expect(body).toContain('withUnassignedAccountChange(prisma, userId,');
    expect(body).not.toContain('prisma.users.update(');
    expect(body.indexOf('sendVerification(')).toBeGreaterThan(body.indexOf('await withUnassignedAccountChange('));
  });
  it('general settings cannot overwrite financial plan fields',()=>{
    const body=action('src/app/admin/actions.ts','saveSettingsAction');
    expect(body).toContain("if (pricingSubmitted) await requireAccess('pricing', 'manage_settings')");
    expect(body.indexOf("requireAccess('pricing', 'manage_settings')")).toBeLessThan(body.indexOf('await setSetting('));
    expect(body).toContain('if (pricingSubmitted) {');
  });
  it('public ad moderation offers the capability for its current publication state',()=>{
    const source=readFileSync('src/app/ads/[id]/page.tsx','utf8');
    expect(source).toContain("hasAccess(session.uid, 'ads', 'approve')");
    expect(source).toContain('const canToggleAd = ad.status === 1 ? canArchive : canApproveAd');
    expect(source).toContain('canToggleAd && (ad.status !== 1 || canSuspendStore)');
  });
});
