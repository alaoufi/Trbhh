const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseBatchIds}=require('./cj-store-batch.cjs');
test('bounded explicit product IDs reject duplicates, shell input and implicit full-catalog execution',()=>{
 assert.deepEqual(parseBatchIds('1,247'),['1','247']);
 for(const value of ['', '0', '01', '1,1', '1;echo', '1,$(echo)', 'all', Array.from({length:25},(_,i)=>i+1).join(',')])assert.throws(()=>parseBatchIds(value));
});
