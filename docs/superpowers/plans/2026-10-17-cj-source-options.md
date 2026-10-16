# Source-only CJ options policy
The user's correction supersedes title/suffix heuristics: no option types are inferred from titles, SKU, images, category, size pattern, or packaging dimensions.
Official reference: https://developers.cjdropshipping.com/en/api/api2/api/product.html (Product Details GET).
- productKeyEn declares ordered dimension names (Color-Size).
- variants[].variantKey declares ordered values (Purple-US 12.5).
- Preserve schema with all dedicated query variants at import; retain exact values and identities.
- Render translated labels/values only. Never modify source values sent to CJ.
- An absent schema, inconsistent cardinality, repeated dimensions or conflicting explicit values blocks selection; display original key without invented numbering.
- Legacy rows read product detail metadata only when needed, with existing bounded account-scoped cache. Never update stored price, stock, product text, or store flags.
- Queue untranslated source text through the existing bounded translation path; do not enable workers or models or wait on inference during page render.
Acceptance: source-shaped schema/order tests, all import/client/selector/cart/access tests, type check, build, independent review. Live shoe acceptance remains after manual deployment.
