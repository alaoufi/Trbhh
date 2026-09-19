/** Strict startup attestation; unknown grant syntax or roles fails closed. */
export function assertSelectOnlyGrants(grants: string[], schema: string, role: string): void {
 const fail=()=>{throw new Error('Preview requires a dedicated SELECT-only database principal without roles or grant option');};
 if (!/^[a-zA-Z0-9_]+$/.test(schema) || role !== 'NONE' || !grants.length) fail();
 let hasSelect=false;
 for(const grant of grants) {
  if (/WITH GRANT OPTION/i.test(grant)) fail();
  if (/^GRANT USAGE ON \*\.\* TO /i.test(grant)) continue;
  const match=/^GRANT SELECT ON `([a-zA-Z0-9_]+)`\.\* TO /i.exec(grant);
  if (!match || match[1]!==schema) fail();
  hasSelect=true;
 }
 if(!hasSelect) fail();
}
