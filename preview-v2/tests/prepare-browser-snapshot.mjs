import {mkdirSync,writeFileSync} from 'node:fs';
import {snapshotFixture} from './snapshot-fixture.mjs';
const dir=new URL('../test-results/',import.meta.url);mkdirSync(dir,{recursive:true});
writeFileSync(new URL('synthetic-snapshot.json',dir),JSON.stringify(snapshotFixture()));
