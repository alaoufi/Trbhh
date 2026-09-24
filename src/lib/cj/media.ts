import 'server-only';
import type { CjProductDetail } from './types';

/** Keep the source product's cover first, then its variants and images in its description. */
export function collectCjProductImages(product: CjProductDetail): string[] {
  const inDescription = [...(product.description ?? '').matchAll(/(?:src|data-src|data-original|data-lazy-src)\s*=\s*["']([^"']+)/gi)].map(match => match[1]);
  const bareUrls = (product.description ?? '').match(/https?:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?/gi) ?? [];
  const normalize = (value: string | null | undefined) => {
    const candidate = value?.trim();
    if (!candidate) return null;
    const absolute = candidate.startsWith('//') ? `https:${candidate}` : candidate;
    try {
      const url = new URL(absolute);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  };
  const sourceImages = [product.productImage, ...(product.productImages ?? []), ...product.variants.map(variant => variant.variantImage), ...inDescription, ...bareUrls]
    .flatMap(value => (value ?? '').split(/[,\s]+/).filter(Boolean));
  return [...new Set(sourceImages.map(normalize).filter((url): url is string => !!url))].slice(0, 12);
}
