#!/usr/bin/env node
'use strict';

// Staging-only, idempotent category bootstrap. Production is refused by design.
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');

async function main() {
  if (process.env.STAGING_CATEGORY_SEED !== '1') throw new Error('staging_seed_disabled');
  const payload = JSON.parse(fs.readFileSync('/app/scripts/release/category-seeds.json', 'utf8'));
  const db = new PrismaClient({ log: [] });
  try {
    const [{ db: database }] = await db.$queryRawUnsafe('SELECT DATABASE() AS db');
    const expectedDatabase = process.env.STAGING_DATABASE_NAME;
    if (!expectedDatabase || String(database) !== expectedDatabase) throw new Error('non_staging_database_refused');
    const result = { categoriesAdded: 0, subcategoriesAdded: 0, definitionsAdded: 0, definitionsPreserved: 0 };
    await db.$transaction(async tx => {
      for (const template of payload.templates) {
        const cats = await tx.$queryRawUnsafe('SELECT id,name FROM categories WHERE name=? LIMIT 2', template.categoryName);
        if (cats.length > 1) throw new Error('ambiguous_category');
        let category = cats[0];
        const categoryCreated = !category;
        if (!category) {
          category = (await tx.$queryRawUnsafe("INSERT INTO categories (name,photo_path,is_active,ordered) VALUES (?, '', 'yes', 0)", template.categoryName),
            (await tx.$queryRawUnsafe('SELECT id,name FROM categories WHERE name=? ORDER BY id DESC LIMIT 1', template.categoryName))[0]);
          result.categoriesAdded++;
        }
        const subs = await tx.$queryRawUnsafe('SELECT id,name FROM sub_categories WHERE category_id=? AND name=? LIMIT 2', category.id, template.name);
        if (subs.length > 1) throw new Error('ambiguous_subcategory');
        let sub = subs[0];
        const subcategoryCreated = !sub;
        if (!sub) {
          await tx.$executeRawUnsafe('INSERT INTO sub_categories (category_id,name,`order`,active) VALUES (?, ?, 0, 1)', category.id, template.name);
          sub = (await tx.$queryRawUnsafe('SELECT id,name FROM sub_categories WHERE category_id=? AND name=? ORDER BY id DESC LIMIT 1', category.id, template.name))[0];
          result.subcategoriesAdded++;
        }
        const defs = await tx.$queryRawUnsafe('SELECT subcategory_id FROM ad_category_definitions WHERE subcategory_id=? LIMIT 1', sub.id);
        if (defs.length) result.definitionsPreserved++;
        else {
          const stored = { schemaVersion: 2, fields: template.fields, listingPolicy: template.listingPolicy };
          await tx.$executeRawUnsafe('INSERT INTO ad_category_definitions (subcategory_id,version,kind,price_enabled,goods_enabled,fields_json) VALUES (?,1,?,?,?,?)', sub.id, template.kind, Number(template.priceEnabled), Number(template.goodsEnabled), JSON.stringify(stored));
          result.definitionsAdded++;
        }
        // Existing admin visibility is authoritative; only newly-created rows get defaults.
        if (categoryCreated) await tx.$executeRawUnsafe("UPDATE categories SET is_active='yes' WHERE id=?", category.id);
        if (subcategoryCreated) await tx.$executeRawUnsafe('UPDATE sub_categories SET active=1 WHERE id=?', sub.id);
      }
      await tx.$executeRawUnsafe("INSERT INTO site_settings (k,v) VALUES ('categories_v2_enabled','1') ON DUPLICATE KEY UPDATE v='1'");
    });
    console.log(JSON.stringify(result));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(`staging category seed refused: ${error.message}`); process.exitCode = 1; });
