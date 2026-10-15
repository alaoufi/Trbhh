const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('capacity launcher refuses conflicting operations and preserves resource limits without cutover',()=>{
 const text=fs.readFileSync('scripts/release/manual-search-capacity.sh','utf8');
 assert.match(text,/flock -n 8/);assert.match(text,/flock -n 9/);assert.match(text,/ACTIVE_DEPLOYMENT/);
 assert.match(text,/candidate=[a-f0-9]{40}/);assert.match(text,/10737418240/);assert.match(text,/4000000000/);
 assert.match(text,/timeout --signal=TERM --kill-after=10s 270s/);
 assert.doesNotMatch(text,/git (?:switch|checkout|reset)|compose.*\b(?:up|down|pull)\b|docker (?:rm|stop|restart|volume|system)|systemctl|api\/(?:pull|copy|delete)/);
});
