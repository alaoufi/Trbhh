// Read-only inventory. No deletion or automatic merge is performed.
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
(async()=>{
  const categories=await db.$queryRaw`SELECT id,name,is_active FROM categories ORDER BY ordered,id`;
  const columns=await db.$queryRaw`SELECT TABLE_NAME AS t,COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME IN ('category_id','subcategory_id') AND DATA_TYPE IN ('tinyint','smallint','mediumint','int','bigint') ORDER BY TABLE_NAME,COLUMN_NAME`;
  const tables=new Map();
  for(const {t,c} of columns){if(!/^[a-zA-Z0-9_]+$/.test(t))throw Error('UNSAFE_TABLE_NAME');if(t==='sub_categories')continue;if(!tables.has(t))tables.set(t,[]);tables.get(t).push(c);}
  const result=[];
  for(const cat of categories){
    const children=await db.$queryRaw`SELECT id FROM sub_categories WHERE category_id=${cat.id}`;
    const references={};
    for(const [table,cols] of tables){
      const where=[],args=[];
      for(const col of cols){if(col==='category_id'){where.push('`category_id`=?');args.push(cat.id);}else if(children.length){where.push('`subcategory_id` IN ('+children.map(()=>'?').join(',')+')');args.push(...children.map(s=>s.id));}}
      if(!where.length)continue;
      const [count]=await db.$queryRawUnsafe('SELECT COUNT(*) AS n FROM `'+table+'` WHERE '+where.join(' OR '),...args);
      if(Number(count.n)>0)references[table]=String(count.n);
    }
    result.push({id:String(cat.id),name:cat.name,active:cat.is_active,subcategories:children.length,references});
  }
  console.log(JSON.stringify(result,null,2));
  console.log('READ_ONLY_CATEGORY_USAGE_COMPLETE; NOTHING_DELETED');
})().catch(()=>{console.error('CATEGORY_USAGE_CHECK_FAILED; NOTHING_DELETED');process.exitCode=1;}).finally(()=>db.$disconnect());
