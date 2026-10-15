import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const read=(path:string)=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
describe('local CPU runtime provisioning',()=>{
 it('pins the official alternative without the failing MLX/CUDA image layer',()=>{
  const compose=read('docker-compose.local-ai.yml');
  expect(compose).toContain('ollama/ollama:0.40.4-rocm@sha256:60cc4504526c70f5f693f5405c129efe7784c9b5c99b22ff41dbf7667a1a637f');
  expect(compose).toContain('CUDA_VISIBLE_DEVICES: "-1"');expect(compose).toContain('ROCR_VISIBLE_DEVICES: "-1"');
  expect(compose).toContain('mem_limit: 10g');expect(compose).toContain('memswap_limit: 10g');expect(compose).toContain('cpus: 4');
  expect(compose).toContain('max-size: "10m"');expect(compose).toContain('max-file: "2"');
 });
 it('pulls quietly before starting only the verified runtime',()=>{
  const installer=read('scripts/local-ai/install-runtime.sh');
  expect(installer).toContain('pull --quiet ollama');
  expect(installer).toContain('up -d --pull never --no-deps ollama');
  expect(installer.indexOf('pull --quiet ollama')).toBeLessThan(installer.indexOf('up -d --pull never --no-deps ollama'));
  expect(installer).toContain('LOCAL_AI_IMAGE_PULL_FAILED');
  expect(installer).not.toMatch(/docker (?:system|volume) prune|systemctl restart docker|rm -rf/);
 });
});
