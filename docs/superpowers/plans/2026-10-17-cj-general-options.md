# General CJ option correctness
Scope P1: read supplier option data without changing commercial fields or production.
1. Reproduce metadata loss and ambiguous selection using source-shaped fixtures.
2. Preserve structured option properties during import; ignore empty aliases.
3. Parse explicit attributes and conservative color/size, dimensions, pack and technical options; never infer attributes from SKU or product image.
4. Build dependent selectors for any bounded attribute schema, preserve original labels as identity through translation, reject duplicate identities.
5. Block cart insertion for unresolved options with an actionable message. Preserve exact VID/SKU snapshot.
6. Verify fixture matrix across categories, actual shoe 281 metadata when available, full tests, type/build and independent review. No deployment until requested.
Live source observation: existing user terminal showed shoe281 SKU CJYD322988410JQ, key Purple-US 12.5, full supplier title ending Purple US 12.5. Decimal system-prefixed shoe sizes reproduced the failure. Actual store remains on 9bd90113 until manual deployment. Local browser fixture verifies separate fields, matching SKU snapshot, dependency reset and no production payment. Source page anti-bot challenge was not bypassed.
