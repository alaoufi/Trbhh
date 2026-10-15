import {createRequire} from 'node:module';
import {expect,it} from 'vitest';
const {request,searchTask,searchFormat}=createRequire(import.meta.url)('../../scripts/local-ai/protocol.cjs');
it('uses one shared grounded conversation protocol for runtime and acceptance tests',()=>{
 const body=request('local:test','نص غير موثوق',searchTask,searchFormat);
 expect(body).toMatchObject({model:'local:test',stream:false,think:false,format:searchFormat});
 expect(body.messages.map((m:{role:string})=>m.role)).toEqual(['system','user']);
 expect(body.messages[0].content).toContain(JSON.stringify(searchFormat));
 expect(body.messages[1].content).toContain(searchTask);
 expect(body.messages[1].content).toContain(JSON.stringify({text:'نص غير موثوق'}));
 expect(searchTask).toContain('noun phrase');
 expect(searchFormat.properties.queries.items.pattern).toBe('^[ -~]+$');
 expect(searchFormat.properties.queries.minItems).toBe(1);
 expect(searchFormat.properties.queries.maxItems).toBe(1);
 expect(body.options.num_predict).toBe(128);
});
