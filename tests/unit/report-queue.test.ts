import {expect,it,vi} from 'vitest';
const query=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/prisma',()=>({prisma:{$queryRaw:query}}));
it('reads the queue from latest replies and explicit decisions without changing records',async()=>{
 const api=await import('@/lib/report-queue');
 query.mockResolvedValue([{kind:'ad',id:3n,created_at:new Date(),pending:0},{kind:'general',id:4n,created_at:new Date(),pending:1}]);
 const rows=await api.getReportQueue();
 expect(rows.filter(r=>r.pending).map(r=>r.id)).toEqual([4n]);
 const sql=query.mock.calls[0][0].sql;
 expect(sql).toContain('ORDER BY rr.id DESC LIMIT 1');
 expect(sql).toContain("r.action = 'reply'");
 expect(sql).toContain('UNION ALL');
});
