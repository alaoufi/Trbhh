import { hydrateRoot } from 'react-dom/client';
import { CjProductGallery } from '../../src/components/cj/product-gallery';
import { CjProductImage } from '../../src/components/cj/product-image';
import { AddToTrialCart, CartLink } from '../../src/components/cj/cart-controls';
import { TrialCart } from '../../src/components/cj/trial-cart';
import { CjPurchasePanel } from '../../src/components/cj/purchase-panel';

for (const element of document.querySelectorAll<HTMLElement>('[data-cj-fixture-island]')) {
  const name = element.dataset.cjFixtureIsland;
  const props = JSON.parse(element.dataset.cjFixtureProps || '{}');
  const content = name === 'gallery' ? <CjProductGallery {...props} /> : name === 'image' ? <CjProductImage {...props} />
    : name === 'add' ? <AddToTrialCart {...props} /> : name === 'cart-link' ? <CartLink {...props} /> : name === 'purchase' ? <CjPurchasePanel {...props} /> : <TrialCart {...props} />;
  hydrateRoot(element, content, { identifierPrefix: element.dataset.cjFixturePrefix });
}
