# Home opportunities fallback — 2026-10-20

User-approved refinement: fill opportunity placements using actual public ads from other categories when necessary, and prioritize genuine source promotion flags (gold, silver, special). Retain real title, image, category and destination. Deduplicate ads and titles. If fewer than four unique ads exist, stretch the available cards; if none exist, show the publish CTA. No new queries, pricing changes, financial writes or shop activation.

Validation: 18 focused unit tests passed; scoped ESLint and TypeScript passed; production build passed. Edge browser checked full, two-ad and empty inventories at 1440px and 390px: featured ad first, distinct real destinations, images retained, adaptive columns, no page errors or horizontal overflow. Browser fixture uses real components and selection with local fixture data, not authenticated production data. Independent source review found no blockers.

Release is code only, pinned to the verified preceding eae014e9 release. Deployment itself is performed separately using the supplied SSH script.
