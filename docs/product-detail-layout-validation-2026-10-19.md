# Product detail layout validation — 2026-10-19

Scope: CJ detail, approved preview and commerce detail. Existing Ad/Company gallery zoom remains unchanged. No homepage redesign or source content/image invention. No changes to price arithmetic, cart actions, permissions, privacy, product inventory, financial records, scheduler or buying flags.

- Two desktop columns for media/purchase; one mobile column. CJ specs and description moved from reserved gallery column to fullwidth sections below top row.
- Shared native section anchors include only rendered targets, remain readable without JS, wrap on mobile and provide focus/44px targets. No hidden tab panels or fabricated reviews.
- Product size guide remains near controls and exactly once when stock is positive or unavailable. Configured CJ measurements remain unchanged.
- Approved CJ preview retains staff access/redirect restrictions and contains no purchase control.

Validation: 3564 unit tests passed across435 files;9tests/1file skipped. TypeScript and scoped ESLint passed. Production build passed (see task output). Local Edge/Playwright fixture uses actual CommerceProductDetail, actual variant controls, shared zoom and section nav, with local NextLink/server-action adapters and illustrative SVG. At1440px two columns and390px stacked layout passed; navigation target existence/clicks, variant price change, exactlyone sizingguide and no horizontal overflow passed. Screenshots inspected. No API writes allowed by fixture. This is local browser emulation, not authenticated production UI verification or a physical-device test.

Independent review caught then confirmed the zero-stock size-guide regression fixed. Production baseline read from public /api/version twice: d955467d73cd4d31d7916e022aac6155da774457. Release includes preceding fd735dde Lumi safeguards; runtime timer status is inspected only after release, not enabled or invoked. No live purchase, refund, data mutation or deployment performed here.
