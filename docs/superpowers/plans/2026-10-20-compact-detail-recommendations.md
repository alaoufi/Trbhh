# Compact detail recommendations — 2026-10-20

P3 presentation-only refinement requested by the user: reuse the approved homepage marketplace cards and responsive density for same-advertiser and similar ads. Shared catalog CSS gives 8 columns on wide containers, 5 on medium and 3 on phone, with 9px gaps and compact card text. Related sections use 12px separation and 8px heading margins. Existing source order, visibility, links, prices and in-store exclusion remain unchanged; no queries or financial writes added. Empty sections stay hidden.

Verified: TypeScript and scoped ESLint passed; 15 existing layout/feed-size tests passed; production build passed. Edge browser fixture using actual recommendation/card components checked 1440/768/390px: both grids use matching card widths and 9px gaps, no horizontal overflow or page errors. Visually inspected phone screenshot. Fixture data and framework stubs do not substitute for authenticated production verification.
