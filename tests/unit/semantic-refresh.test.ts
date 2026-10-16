import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const overlay=readFileSync('docker-compose.semantic-search.yml','utf8');
const installer=readFileSync('scripts/local-ai/install-search-refresh.sh','utf8');
it('bounds a separate private embedding service without host ports or GPU access',()=>{
 expect(overlay).toMatch(/container_name: trbhh-embedding/);
 expect(overlay).toMatch(/cpus: 2\s/);expect(overlay).toMatch(/mem_limit: 2g\s/);expect(overlay).toMatch(/memswap_limit: 2g\s/);
 expect(overlay).toContain('trbhh-semantic-models:/root/.ollama');expect(overlay).toContain('networks: [trbhh]');expect(overlay).toContain('trbhh.local-embedding: "1"');
 expect(overlay).toContain('OLLAMA_NO_CLOUD: "1"');expect(overlay).toContain('OLLAMA_NUM_PARALLEL: "1"');expect(overlay).toContain('OLLAMA_MAX_LOADED_MODELS: "1"');expect(overlay).toContain('OLLAMA_MAX_QUEUE: "2"');expect(overlay).toContain('OLLAMA_CONTEXT_LENGTH: "2048"');
 expect(overlay).not.toMatch(/^\s*(?:ports|devices|gpus):/m);
});
it('runs the locked refresh at low priority inside the container with bounded stdin execution',()=>{
 expect(installer).toContain('docker exec trbhh-app timeout 5 nice -n 15 node -e');
 expect(installer).toContain('docker exec -i trbhh-app timeout --signal=TERM --kill-after=10s 29m nice -n 15 node - --refresh');
 expect(installer).toContain('trbhh-semantic-index.lock');expect(installer).toContain('flock -n 9 || exit 0');
 expect(installer).toContain('__trbhhSemanticCore');expect(installer).toContain('__trbhhPublicProductSelect');expect(installer).toContain('cat build-product-index.cjs');
 expect(installer).toContain('sha256sum --check --status');expect(installer).toContain('! -L');expect(installer).toContain('TimeoutStartSec=30min');expect(installer).toContain('OnUnitInactiveSec=15min');
 expect(installer).not.toMatch(/curl|wget|ollama\s+(?:pull|rm)|update-model|trbhh-local-ai|\$executeRaw|site_settings\.(?:update|upsert)/);
});
it('has valid Bash syntax before any manual installation',()=>{
 const shell=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
 const result=spawnSync(shell,['-n','scripts/local-ai/install-search-refresh.sh'],{encoding:'utf8'});
 expect(result.status,result.stderr).toBe(0);
});
