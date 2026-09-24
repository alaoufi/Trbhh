'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{runInNewContext}=require('node:vm');
const {build}=require('./build-finance-schema-check.cjs');
test('release schema bundle resolves reviewed dependencies before checking the database and fails closed',async()=>{
 let reads=0,disconnected=false;const errors=[],state={env:{SUPPLIER_ALLOW_LIVE_ORDERS:'false'},exitCode:0};
 class PrismaClient{async $queryRaw(){reads++;return [];}async $disconnect(){disconnected=true;}}
 await runInNewContext(build(),{require:name=>{assert.equal(name,'@prisma/client');return {PrismaClient};},process:state,console:{log:()=>assert.fail('Incomplete schema cannot pass'),error:message=>errors.push(message)}});
 assert.ok(reads>0);assert.equal(disconnected,true);assert.equal(state.exitCode,1);assert.deepEqual(errors,['finance_release_schema_or_gate_failed']);
});
