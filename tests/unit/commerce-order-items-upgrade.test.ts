import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const root=resolve(import.meta.dirname,'../..');
const sync=readFileSync(resolve(root,'src/data/schema-sync.ts'),'utf8');
const ddl=readFileSync(resolve(root,'src/lib/commerce/schema.ts'),'utf8');

describe('legacy commerce order item upgrade',()=>{
  it('adds only missing nullable/defaulted snapshot columns without rewriting historical rows',()=>{
    for(const [column,definition] of [
      ['list_unit_price_minor','INT NULL'],
      ['discount_minor','INT NOT NULL DEFAULT 0'],
      ['variant_key',"VARCHAR(191) COLLATE utf8mb4_bin NOT NULL DEFAULT ''"],
      ['variant_snapshot','JSON NULL'],
    ]){
      expect(sync).toContain(`ALTER TABLE commerce_order_items ADD COLUMN ${column} ${definition}`);
      expect(ddl).toContain(`${column} ${definition}`);
    }
    expect(sync).not.toMatch(/(?:UPDATE|DELETE)\s+commerce_order_items/i);
    expect(sync).not.toMatch(/DROP\s+(?:COLUMN|TABLE).*commerce_order_items/i);
  });
});
