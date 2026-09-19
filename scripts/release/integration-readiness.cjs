/* Read-only: never return secrets, tokens, member data or ad content. */
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  const flags = await db.$queryRawUnsafe("SELECT k,v FROM site_settings WHERE k IN ('categories_v2_enabled','commerce_enabled','commerce_checkout_enabled')");
  const categories = await db.$queryRawUnsafe("SELECT c.id,c.name,c.is_active,COUNT(DISTINCT s.id) AS subcategories,COUNT(DISTINCT d.subcategory_id) AS definitions FROM categories c LEFT JOIN sub_categories s ON s.category_id=c.id AND s.active=1 LEFT JOIN ad_category_definitions d ON d.subcategory_id=s.id GROUP BY c.id,c.name,c.is_active ORDER BY c.ordered,c.id");
  const definitions = await db.$queryRawUnsafe("SELECT s.id,s.name,d.kind,d.price_enabled,d.goods_enabled,d.fields_json FROM sub_categories s JOIN ad_category_definitions d ON d.subcategory_id=s.id WHERE s.active=1");
  const summary = definitions.map(d => {
    const fields = typeof d.fields_json === 'string' ? JSON.parse(d.fields_json) : d.fields_json;
    return {id:d.id,name:d.name,kind:d.kind,price:d.price_enabled,condition:d.goods_enabled,fieldCount:fields.length,fields:fields.map(f => ({key:f.key,label:f.label,type:f.type,required:f.required,hidden:f.hidden}))};
  });
  const counts = await db.$queryRawUnsafe('SELECT (SELECT COUNT(*) FROM ads) AS ads,(SELECT COUNT(*) FROM users) AS members,(SELECT COUNT(*) FROM stores) AS stores');
  const env = Object.fromEntries(['SUPPLIER_PUBLIC_ORIGIN','SALLA_CLIENT_ID','SALLA_CLIENT_SECRET','SUPPLIER_TOKEN_ENCRYPTION_KEY','SALLA_WEBHOOK_SECRET','SUPPLIER_RECONCILE_SECRET'].map(k => [k,Boolean(process.env[k]) ]));
  console.log(JSON.stringify({flags,categories,definitions:summary,counts,environmentConfigured:env},(_,v)=>typeof v==='bigint'?String(v):v));
}
main().catch(() => {console.error('Readiness inspection failed; no credentials or raw database errors emitted.');process.exitCode=1;}).finally(()=>db.$disconnect());
