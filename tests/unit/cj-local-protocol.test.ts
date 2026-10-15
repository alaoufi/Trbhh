import {createRequire} from 'node:module';
import {expect,it} from 'vitest';
const {request,searchTask,searchFormat,translationTask,translationFormat}=createRequire(import.meta.url)('../../scripts/local-ai/protocol.cjs');
it('uses one shared grounded conversation protocol for runtime and acceptance tests',()=>{
 const body=request('local:test','نص غير موثوق',searchTask,searchFormat);
 expect(body).toMatchObject({model:'local:test',stream:false,think:false,format:searchFormat});
 expect(body.messages.map((m:{role:string})=>m.role)).toEqual(['system','user']);
 expect(body.messages[0].content).toContain('{"queries":["..."]}');
 expect(body.messages[1].content).toContain(searchTask);
 expect(body.messages[1].content).toContain(JSON.stringify({text:'نص غير موثوق'}));
 expect(searchTask).toContain('noun phrase');
 expect(searchFormat.properties.queries.items.pattern).toBe('^[ -~]+$');
 expect(searchFormat.properties.queries.minItems).toBe(1);
 expect(searchFormat.properties.queries.maxItems).toBe(1);
 expect(body.options.num_predict).toBe(128);
});
it('bounds fixed instruction overhead while retaining the schema and constraints',()=>{
 const search=request('test','sample',searchTask,searchFormat),translation=request('test','sample',translationTask('ar'),translationFormat);
 const bytes=(body:{messages:{content:string}[]})=>body.messages.reduce((sum,m)=>sum+Buffer.byteLength(m.content),0);
 expect(bytes(search)).toBeLessThan(450);expect(bytes(translation)).toBeLessThan(320);
 for(const word of ['brand','model','accessory','material','size','voltage','quantities','negations'])expect(searchTask).toContain(word);
 expect(translationTask('ar')).toContain('naturally');expect(translationTask('ar')).toContain('negations');
 expect(translation.options.num_predict).toBe(512);
});
