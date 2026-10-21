# Member-friendly publication warnings — 2026-10-22

P2 continuation requested by the user to reduce publishing friction. Builds on 589a46ef's natural-description and duplicate-evidence fixes.

Cross-member text matching now blocks only the submitted duplicate and shows a correction prompt. It no longer increments duplicate strikes, automatically bans the member, or sends repeated threatening push notifications. Audit logging remains. Remove countdown-to-ban wording from the form; make keyword/own-duplicate prompts explain how to correct the text or edit the existing ad. Existing bans are not lifted automatically. Package entitlements/pricing, required contact/title/details, approval setting, flooding safeguards and severe-content handling remain unchanged.

Verification: 31 focused tests passed, including three repeated cross-member duplicate submissions without any ban/strike/create calls, plus publication/store linking and optional-extra source/price regressions. Scoped ESLint and TypeScript passed. Final production build passed (work/moderation-easing-build.log). No authenticated production writes or deployment performed. The specific reported member listing still requires the supplied read-only live diagnosis; this policy change alone is not proof that an existing listing is visible.
