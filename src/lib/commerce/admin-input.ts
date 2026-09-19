import { parseSar } from './money';

export function parseStockAdjustment(raw: string): number {
  if (raw === '') return 0;
  const n = Number(raw);
  if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(n) || Math.abs(n) > 1000000) throw new Error('invalid_stock_adjustment');
  return n;
}

export function parseCommerceProduct(data: FormData) {
  const title = String(data.get('title') || '').trim();
  const priceMinor = parseSar(String(data.get('price') || ''));
  const stockRaw = String(data.get('stock') ?? '');
  const stock = Number(stockRaw);
  const adRaw = String(data.get('adId') || '');
  if (!title || title.length > 200 || priceMinor <= 0 || !/^\d+$/.test(stockRaw)
    || !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000
    || (adRaw && (!/^[1-9]\d{0,14}$/.test(adRaw)))) throw new Error('invalid_product');
  return { title, priceMinor, stock, adId: adRaw ? BigInt(adRaw) : null,
    approved: data.get('approved') === '1', visible: data.get('visible') === '1', enabled: data.get('enabled') === '1' };
}
