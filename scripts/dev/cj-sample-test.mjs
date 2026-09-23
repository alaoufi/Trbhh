// اختبار قراءة فقط لمنتجات CJ عبر CJ API v2.0 — بلا طلبات ولا مدفوعات ولا تعديل.
// يقرأ CJ_API_EMAIL و CJ_API_KEY من بيئة الخادم فقط (لا يُطبعان ولا يُخزَّنان في الكود).
// يصادق مرة واحدة (CJ يحدّ الإصدار بمرّة/٥ دقائق)، ثم يجلب عيّنة محدودة بكل الحقول.
const BASE = process.env.CJ_API_BASE || 'https://developers.cjdropshipping.com/api2.0/v1';
const EMAIL = process.env.CJ_API_EMAIL || '';
const KEY = process.env.CJ_API_KEY || '';
const LIMIT = Math.max(1, Math.min(5, Number(process.argv[2]) || 3));

const mask = (s) => (s ? `${String(s).slice(0, 2)}…(${String(s).length} حرف)` : '—');
async function call(path, { method = 'GET', token, query, body } = {}) {
  const qs = query ? '?' + Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') : '';
  const res = await fetch(`${BASE}${path}${qs}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'CJ-Access-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  let json = null; try { json = await res.json(); } catch { /* */ }
  return { status: res.status, code: json?.code, ok: res.status === 200 && json?.result !== false, message: json?.message, data: json?.data };
}

async function main() {
  console.log('CJ read-only sample test');
  console.log(`- endpoint: ${BASE}`);
  console.log(`- email: ${mask(EMAIL)} · apiKey: ${mask(KEY)}`);
  if (!EMAIL || !KEY) { console.error('✖ CJ_API_EMAIL/CJ_API_KEY غير مضبوطين في البيئة. أضِفهما كأسرار بيئة ثم أعد التشغيل في جلسة جديدة.'); process.exit(2); }

  // 1) المصادقة
  const auth = await call('/authentication/getAccessToken', { method: 'POST', body: { email: EMAIL, password: KEY } });
  if (!auth.ok || !auth.data?.accessToken) { console.error(`✖ فشل المصادقة: HTTP ${auth.status} code=${auth.code} — ${auth.message || 'بلا رسالة'}`); process.exit(1); }
  const token = auth.data.accessToken;
  console.log('\n✓ المصادقة ناجحة');
  console.log(`- accessToken: ${mask(token)} · refreshToken: ${mask(auth.data.refreshToken)}`);
  console.log(`- انتهاء accessToken: ${auth.data.accessTokenExpiryDate || '—'} · refresh: ${auth.data.refreshTokenExpiryDate || '—'}`);

  // 2) عيّنة منتجات (قراءة فقط)
  const list = await call('/product/list', { token, query: { pageNum: 1, pageSize: LIMIT } });
  if (!list.ok) { console.error(`✖ فشل جلب القائمة: HTTP ${list.status} code=${list.code} — ${list.message}`); process.exit(1); }
  const rows = Array.isArray(list.data?.list) ? list.data.list.slice(0, LIMIT) : [];
  console.log(`\n✓ جُلبت قائمة منتجات: ${rows.length}`);

  const errors = [];
  const samples = [];
  for (const p of rows) {
    const pid = String(p.pid ?? p.productId ?? '');
    if (!pid) continue;
    const [detail, stock] = await Promise.all([
      call('/product/query', { token, query: { pid } }),
      call('/product/stock/queryByPid', { token, query: { pid } }),
    ]);
    if (!detail.ok) errors.push(`detail(${pid}): code=${detail.code} ${detail.message}`);
    if (!stock.ok) errors.push(`stock(${pid}): code=${stock.code} ${stock.message}`);
    const stockByVid = new Map();
    if (stock.ok && Array.isArray(stock.data)) for (const s of stock.data) { const v = String(s.vid ?? ''); if (v) stockByVid.set(v, (stockByVid.get(v) || 0) + (Number(s.storageNum ?? s.totalInventoryNum) || 0)); }
    const variants = (detail.ok && Array.isArray(detail.data?.variants) ? detail.data.variants : []).map((v) => ({
      vid: String(v.vid ?? ''), sku: String(v.variantSku ?? v.sku ?? ''), name: v.variantNameEn ?? v.variantName ?? null,
      priceUsd: Number(v.variantSellPrice ?? v.sellPrice) || null, weight: Number(v.variantWeight) || null,
      stock: stockByVid.has(String(v.vid ?? '')) ? stockByVid.get(String(v.vid)) : null,
    }));
    const variantImages = (detail.ok && Array.isArray(detail.data?.variants) ? detail.data.variants : []).map((v) => v.variantImage).filter(Boolean);
    const images = [...new Set([p.productImage || p.bigImage, ...variantImages, ...(Array.isArray(detail.data?.productImageSet) ? detail.data.productImageSet : [])].filter(Boolean))];
    samples.push({
      pid, sku: String(p.productSku ?? p.sku ?? ''), name: String(p.productNameEn ?? p.productName ?? ''),
      category: p.categoryName ?? null, priceUsd: Number(p.sellPrice) || null,
      imagesCount: images.length, sampleImage: images[0] || null, variantsCount: variants.length,
      totalStock: [...stockByVid.values()].reduce((a, b) => a + b, 0), variants: variants.slice(0, 3),
    });
  }

  console.log('\n================ العيّنة التفصيلية ================');
  console.log(JSON.stringify(samples, null, 2));
  console.log('\n================ ملخّص ================');
  console.log(`المصادقة: ناجحة ✓`);
  console.log(`عدد المنتجات المسترجعة: ${samples.length}`);
  console.log(`الحقول المتاحة لكل منتج: pid, sku, name, category, priceUsd, images, variants[{vid,sku,name,priceUsd,weight,stock}], totalStock`);
  console.log(`أخطاء CJ API: ${errors.length ? '\n - ' + errors.join('\n - ') : 'لا يوجد'}`);
}

main().catch((e) => { console.error('E2E ERROR:', e?.message || e); process.exit(1); });
