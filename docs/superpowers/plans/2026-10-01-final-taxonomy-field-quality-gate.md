# Final Taxonomy & Field Quality Gate

1. Close the two remaining equipment schema reviews with subtype-specific fields, bounds, units, conditional visibility, and backend validation.
2. Project only currently valid structured values into public details, cards, comparisons, text search, attribute filters, and category-based recommendations.
3. Reclassify safely suppressed legacy taxonomy mismatches as editor review instead of public blockers; keep deterministic remaps separate and never infer category writes from titles.
4. Add a read-only administrator review screen for unresolved records, including taxonomy, reason, legacy keys, suggestion status, and location status.
5. Extend isolated browser lifecycle coverage to every materially different schema family requested by the review.
6. Run the live read-only audit, external crawl, full quality gates, update the readiness report, push only the current branch, and deploy only the read-only Preview.

Safety invariants: no production deployment, no production writes, no destructive migrations, no automatic title-based classification, and no live purchasing.
