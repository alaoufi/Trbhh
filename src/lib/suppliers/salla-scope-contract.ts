export const SALLA_OAUTH_SCOPE_VERSION=1;
export const SALLA_REQUIRED_SCOPES=[
  'offline_access',
  'products.read',
  'customers.read',
  'customers.read_write',
  'metadata.read',
  'orders.read',
  'orders.read_write',
] as const;

export function assertRequiredScopes(value:string):string[]{
  if(typeof value!=='string'||value.length>2048)throw new Error('salla_reauthorization_required');
  const scopes=value.trim().split(/\s+/).filter(Boolean);
  if(scopes.some(scope=>!/^[a-z][a-z0-9_.:-]{0,80}$/.test(scope)))throw new Error('salla_reauthorization_required');
  const granted=new Set(scopes);
  if(SALLA_REQUIRED_SCOPES.some(scope=>!granted.has(scope)))throw new Error('salla_reauthorization_required');
  return [...SALLA_REQUIRED_SCOPES];
}
