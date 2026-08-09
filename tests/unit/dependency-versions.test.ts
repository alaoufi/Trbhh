import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe('production dependency security floor', () => {
  it('pins the patched framework and image-processing releases', () => {
    expect(packageJson.dependencies.next).toBe('16.3.0');
    expect(packageJson.dependencies.sharp).toBe('0.35.3');
    expect(packageJson.devDependencies.postcss).toBe('8.5.23');
    expect(packageJson.devDependencies['eslint-config-next']).toBe('16.3.0');
  });
});
