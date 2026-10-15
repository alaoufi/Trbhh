const fs=require('fs'),cp=require('node:child_process'),test=require('node:test'),assert=require('node:assert/strict');
const text=fs.readFileSync('scripts/release/manual-local-ai-deploy.sh','utf8');
test('pins a concrete candidate and baseline',()=>{assert.match(text,/candidate=[a-f0-9]{40}/);assert.match(text,/baseline=35ac47b1c0b8768a65a14ca8388e2f4febc53c99/);});
test('provisions and validates sidecar before application cutover',()=>{assert.ok(text.indexOf('--provision-only')<text.indexOf('git switch --detach "$candidate"'));assert.match(text,/git archive --format=tar "\$candidate" docker-compose.local-ai.yml scripts\/local-ai/);});
test('requires local and public evidence before activation success',()=>{for(const marker of ['node - --verify','PUBLIC_VERSION_VERIFIED','--install-timer-only','systemctl is-active --quiet'])assert.ok(text.indexOf(marker)<text.indexOf('echo "LOCAL_AI_ACTIVATION_SUCCESS'));assert.match(text,/ROLLBACK FAILED/);});
test('does not delete data or replace database service',()=>{assert.doesNotMatch(text,/docker (?:system|volume|container) prune|docker (?:volume|container) rm|compose.*\bdown\b/);assert.match(text,/--no-build --pull never --no-deps --force-recreate app/);assert.match(text,/Compose environment roundtrip failed/);});

test('keeps normal build output in a private log and follows the background activation',()=>{assert.ok(text.includes('> "$target/build.log" 2>&1'));assert.ok(text.includes('tail -n 20 "$target/build.log"'));assert.ok(text.includes('tail --pid="$watcher"'));assert.ok(text.includes('systemctl is-failed --quiet'));});
