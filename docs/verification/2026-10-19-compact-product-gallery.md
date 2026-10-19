# Compact product gallery correction

Risk: P3. Approved visual refinement using the supplied 1688 screenshots.

- CJ detail and approved preview now use the same narrower 6xl container and 0.85:1.15 gallery/information columns as commerce detail.
- Main images use a bounded height of 280px on phones, 320px on tablets and 360px on desktop; object-contain preserves the original image.
- Desktop thumbnails form a scrollable 64px side rail. Phones retain horizontal touch-friendly thumbnails. Mouse hover, keyboard focus and click select the image.
- Existing zoom, touch dialog, source data, variants, prices, purchase gates and financial behavior remain intact.

Verification: local Playwright fixtures render the real commerce component and CJ gallery at 1440px and 390px. Assertions cover image height, side rail position, thumbnail selection, CJ zoom dialog, commerce variant change, section targets and absence of horizontal overflow. Screenshots were visually inspected. API requests were blocked in the commerce fixture. No payment or production write was performed.

TypeScript, scoped ESLint, production build and 22 targeted layout/zoom tests passed. Full suite: 3562 passed, 9 skipped, two release filesystem proof subprocesses timed out while running concurrently. Both affected suites passed separately with one worker (36 tests); assertions and time limits were not changed. Publisher verification: 11 tests passed.

Live version before preparing this release: 0432f1aee3d13f4c2fd9910e5931ded7c6a81fd4. This document does not certify authenticated production rendering after deployment.
