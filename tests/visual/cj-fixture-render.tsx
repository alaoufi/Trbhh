import { renderToStaticMarkup } from 'react-dom/server';
import Catalog from '../../src/app/cj/page';
import Product from '../../src/app/cj/[id]/page';
import Cart from '../../src/app/cj/cart/page';
import Approved from '../../src/app/cj/approved/[id]/page';
import { fixtureCatalogProducts } from './cj-fixture-data';
import { resetFixtureIslands } from './cj-fixture-islands';
export { GET as imageResponse } from '../../src/app/api/cj/img/route';
export { POST as cartResponse } from '../../src/app/api/cj/trial-cart/route';
export { POST as verifyVariantResponse } from '../../src/app/api/cj/products/[id]/verify-variant/route';
export { publicJpegAlias, publicJpeg } from './cj-fixture-data';
export const fixtureProductIds = fixtureCatalogProducts.map(row => row.id);

export async function renderCjFixture(path: string) {
  const url = new URL(path, 'http://127.0.0.1:4325');
  const pathname = url.pathname;
  const query = Object.fromEntries(url.searchParams);
  const page = pathname === '/cj' ? await Catalog({ searchParams: Promise.resolve(query) }) : pathname === '/cj/cart' ? await Cart()
    : pathname.startsWith('/cj/approved/') ? await Approved({ params: Promise.resolve({ id: pathname.split('/').pop() || '' }) })
    : await Product({ params: Promise.resolve({ id: pathname.split('/').pop() || '' }), searchParams: Promise.resolve({}) });
  resetFixtureIslands();
  return renderToStaticMarkup(page);
}
