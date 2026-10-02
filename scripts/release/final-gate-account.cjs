'use strict';
// Dedicated ordinary test members only; never edits an existing real account.
const fs=require('node:fs');
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient({log:[]});
(async()=>{
  const input=JSON.parse(fs.readFileSync(0,'utf8'));
  if(!/^\d+$/.test(input.run)||!/^\d+$/.test(input.attempt)||!/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(input.passwordHash))throw Error('Invalid test input');
  const url=new URL(process.env.DATABASE_URL);
  if(url.hostname!==`trbhh-final-db-${input.run}`)throw Error('Not the isolated clone');
  for(const i of [0,1]){
    const userName=`finalgate-${input.run}-${input.attempt}-${i}`;
    if(await db.users.findFirst({where:{userName}}))throw Error('Test account already exists');
    await db.users.create({data:{userName,name:'اختبار الإطلاق المعزول',email:`${userName}@example.test`,
      password:input.passwordHash,type:'user',is_admin:0,country_id:1,
      created_at:new Date(),updated_at:new Date(),auth_session_version:require('node:crypto').randomUUID()}});
  }
  console.log('ISOLATED_TEST_ACCOUNTS_READY');
})().catch(()=>{console.error('TEST_ACCOUNT_PROVISION_FAILED');process.exitCode=1}).finally(()=>db.$disconnect());
