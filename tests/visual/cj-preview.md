# Local CJ verification fixture

Run from the repository root:

```powershell
node tests/visual/cj-preview.cjs
node tests/visual/cj-preview.cjs --serve
```

The first command rebuilds nine HTML fixtures and the client bundle. The second rebuilds and serves only `http://127.0.0.1:4325/cj`. Use CUA for browser checks; this script never starts or controls a browser. Restart it after source changes. Generated output is ignored under `docs/screenshots/cj-trial/generated/`.

The fixture sets `NODE_ENV=development` inside its own Node process **before loading Vite**, so its loopback cart requests use the API's explicit nonproduction allowance. It does not read environment files, alter the parent shell or deployed environment, trust forwarded headers, or weaken the production API. Production still accepts only the trusted platform origin. The browser component bundle keeps its explicit production React build; the fixture server and mocked data are development-only.

The fixture renders the actual `/cj`, `/cj/[id]`, `/cj/approved/[id]`, and `/cj/cart` server pages. `CjProductGallery`, `CjProductImage`, `CjPurchasePanel`, `CartLink`, and `TrialCart` are rendered and hydrated as real interactive components. Next's link prefetch is replaced with ordinary local anchors and Next Image with a local native image. Authentication is a synthetic account with only `products:view`; database access and all mutation actions throw. The catalog reader is a synthetic fixture stub: 65 CJ products, two approved products, and six member ads (two trusted). It preserves tab/page query strings for visual checks; production SQL eligibility is covered separately. Member-ad detail routes are outside this local fixture. This does not verify production authentication, middleware, the complete app shell, or a real catalog.

Every amount and description is synthetic and labelled on every page. Product 15 and 16 pair the observed title with its corresponding public CJ image; their prices are deliberately test values. The only outbound requests permitted are GET requests to those two exact images through the actual CJ proxy route. No supplier API, translation provider, database, order, payment, sync, or live environment file is used. The trial-cart POST executes the actual route/quote logic with fixture rows only; variant-verification POST responds from a stub with deterministic fixture prices, inventory and freight.

| Route | Check |
| --- | --- |
| `/cj` | 24 cards per page, shared distinct price styling, primary-image identity, missing-image fallback |
| `/cj?tab=members` / `/cj?tab=verified` | Six synthetic member ads / two synthetic trusted-seller ads |
| `/cj?tab=imported&page=3` | Third page beyond the previous 60-product limit, only fixture import sources |
| `/cj?tab=trbhh` / `/cj/approved/930001` | Two synthetic approved products and informational detail without checkout |
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
