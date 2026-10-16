# Local supplier intelligence completion

Authorized scope: independent supplier intent activation; background translation preparation; actual CJ read-only checks. Do not open store, change current product, create supplier orders, pay, debit, reserve stock, or send notifications.

1. Verify CJ connector authentication, live catalog results, returned variant inventory and Saudi freight when observed identifiers permit. Distinguish connector success from deployed application credentials and paid fulfillment, which remains unverified.
2. Reuse existing translation cache and local services. Add a bounded background text queue and worker, cache-only display/enqueue on misses, preserve manual corrections. Never call warmCjTranslations because it writes product metadata. No schema migration or product-table writes. Limit text bytes, queue length/TTL/retries/work/time, inference concurrency and cancellation. Reuse existing feature setting; give search priority over background inference.
3. Split search activation gates from translation acceptance. Keep existing observed passing search semantics and runtime validation. Background translation has its own honest quality and throughput report; do not promote an unverified translation prompt or call it ready.
4. Unit/integration mocks must prove isolation, bounds, manual correction precedence and zero product writes. Run typecheck, lint, build and full unit gates for app changes; review changes before committing to non-deploy Codex branches only.
5. No SSH command until the deliverable and checks are complete. No live activation claims without server evidence. Report completed code, actual CJ observations, missing server activation and unpaid fulfillment separately.
