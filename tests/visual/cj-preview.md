# Local CJ verification fixture

Run from the repository root:

```powershell
node tests/visual/cj-preview.cjs
node tests/visual/cj-preview.cjs --serve
```

The first command rebuilds seven HTML fixtures and the client bundle. The second rebuilds and serves only `http://127.0.0.1:4325/cj`. Use CUA for browser checks; this script never starts or controls a browser. Restart it after source changes. Generated output is ignored under `docs/screenshots/cj-trial/generated/`.

The fixture renders the actual `/cj`, `/cj/[id]`, and `/cj/cart` server pages. `CjProductGallery`, `CjProductImage`, `AddToTrialCart`, `CartLink`, and `TrialCart` are rendered and hydrated as real interactive components. Next's link prefetch is replaced with ordinary local anchors. Authentication is a synthetic account with only `products:view`; database access and all mutation actions throw. This does not verify production authentication, middleware, the complete app shell, or a real catalog.

Every amount and description is synthetic and labelled on every page. Product 15 and 16 pair the observed title with its corresponding public CJ image; their prices are deliberately test values. The only outbound requests permitted are GET requests to those two exact images through the actual CJ proxy route. No supplier API, translation provider, database, order, payment, sync, or live environment file is used. Other routes and POST actions are denied. The cart POST executes the actual route/quote logic with fixture rows only.

| Route | Check |
| --- | --- |
| `/cj` | Five cards, exact test-price decimals, primary-image identity, missing-image fallback |
| `/cj/15` | Previously rejected `image/jpg` source now served as verified `image/jpeg` |
| `/cj/16` | The corresponding existing `image/jpeg` source remains correct |
| `/cj/900017` | Clearly synthetic two-image gallery, next/previous/thumb controls, enlargement, long SKU and reference link |
| `/cj/900018` | No source image; no replacement from another product |
| `/cj/900019` | Intentional local image 404; same unavailable-image behavior |
| `/cj/900019?hydrate=delayed` | Client bundle delayed one second so the local image can fail before hydration; verify fallback still appears |
| `/cj/cart` | Add, merge, edit quantity, remove, clear, refresh and reload the account-scoped session cart |

Suggested browser checks at 390px and desktop widths:

1. Confirm source images load and no horizontal page overflow appears, including the synthetic long-description/SKU page.
2. On the synthetic gallery, select the second thumbnail, use previous/next, enlarge, and close with its button or Escape.
3. Add product 15 with quantity 2 and product 16 with quantity 1. The synthetic prices are 123.45 and 67.89 SAR; the real quote logic should display 314.79 SAR total. Adding the same product again merges its quantity.
4. Change a cart quantity and commit with blur/Enter, check the revised amount, remove a row, reload, and clear the cart. No checkout or payment control should appear.
5. Confirm `/cj/900018` and `/cj/900019` do not display either printer image as a substitute.

The manifest records `browserVerified: false`; building and HTTP checks alone do not prove hydration, responsive layout, accessibility, or interactions. Save actual CUA observations separately. Source-level tests cover denied/corrupt storage and stale/failed quote behavior; ordinary full-document fixture navigation is not equivalent to Next's client-side routing for memory-only storage fallback.
