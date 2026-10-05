import 'server-only';
import {cache} from 'react';
import {Prisma} from '@prisma/client';
import {prisma} from './prisma';

/** Read-only compatibility for replies written before handled status was introduced. */
export const getReportQueue=cache(async()=>{
 const rows=await prisma.$queryRaw<{kind:'ad'|'general';id:bigint;created_at:Date|null;pending:number|bigint}[]>(Prisma.sql`
 SELECT 'ad' AS kind,r.id,r.created_at,
 ((r.status = 0 OR r.action = 'reply') AND COALESCE((SELECT rr.is_staff FROM report_replies rr WHERE rr.report_kind = 'ad' AND rr.report_id = r.id ORDER BY rr.id DESC LIMIT 1),0) = 0) AS pending
 FROM repord_ads r
 UNION ALL
 SELECT 'general' AS kind,r.id,r.created_at,
 (COALESCE((SELECT rr.is_staff FROM report_replies rr WHERE rr.report_kind = 'general' AND rr.report_id = r.id ORDER BY rr.id DESC LIMIT 1),0) = 0) AS pending
 FROM reports r
 ORDER BY created_at DESC,id DESC`);
 return rows.map(r=>({...r,pending:Number(r.pending)===1}));
});
