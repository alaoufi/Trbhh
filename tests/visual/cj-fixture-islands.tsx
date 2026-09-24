import { createElement, type ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { CjProductGallery as Gallery } from '../../src/components/cj/product-gallery';
import { CjProductImage as ProductImage } from '../../src/components/cj/product-image';
import { AddToTrialCart as Add, CartLink as Link } from '../../src/components/cj/cart-controls';
import { TrialCart as Cart } from '../../src/components/cj/trial-cart';

let sequence = 0;
export function resetFixtureIslands() { sequence = 0; }
function island<Props extends object>(name: string, Component: ComponentType<Props>, props: Props) {
  const prefix = `cj-fixture-${++sequence}-`;
  const html = renderToString(createElement(Component, props), { identifierPrefix: prefix });
  return <div style={{ display: 'contents' }} data-cj-fixture-island={name} data-cj-fixture-props={JSON.stringify(props)} data-cj-fixture-prefix={prefix} dangerouslySetInnerHTML={{ __html: html }} />;
}
export function CjProductGallery(props: Parameters<typeof Gallery>[0]) { return island('gallery', Gallery, props); }
export function CjProductImage(props: Parameters<typeof ProductImage>[0]) { return island('image', ProductImage, props); }
export function AddToTrialCart(props: Parameters<typeof Add>[0]) { return island('add', Add, props); }
export function CartLink(props: Parameters<typeof Link>[0]) { return island('cart-link', Link, props); }
export function TrialCart(props: Parameters<typeof Cart>[0]) { return island('cart', Cart, props); }
