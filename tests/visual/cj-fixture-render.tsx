import { renderToStaticMarkup } from 'react-dom/server';
import Catalog from '../../src/app/cj/page';
import Product from '../../src/app/cj/[id]/page';
import Cart from '../../src/app/cj/cart/page';
import { resetFixtureIslands } from './cj-fixture-islands';
export { GET as imageResponse } from '../../src/app/api/cj/img/route';
export { POST as cartResponse } from '../../src/app/api/cj/trial-cart/route';
export { publicJpegAlias, publicJpeg } from './cj-fixture-data';

export async function renderCjFixture(pathname: string) {
  const page = pathname === '/cj' ? await Catalog() : pathname === '/cj/cart' ? await Cart()
    : await Product({ params: Promise.resolve({ id: pathname.split('/').pop() || '' }), searchParams: Promise.resolve({}) });
  resetFixtureIslands();
  return renderToStaticMarkup(page);
}
