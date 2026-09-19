import { fileURLToPath } from 'node:url';

export default {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    // Shared components stay inside this package: standalone CI needs no parent install.
    root: fileURLToPath(new URL('./', import.meta.url)).replace(/[\\/]$/, ''),
  },
  agentRules: false,
  poweredByHeader: false,
};
