# Trbhh Security and Speed Hardening Plan

> **Scope boundary:** Trbhh only. Do not alter Agar code, data, deployment, DNS, or Cloudflare settings.

## Findings confirmed before implementation

- Production dependency audit reports zero known production vulnerabilities.
- Verification documents use predictable names and are currently delivered through the public `/media/*` route with a long public cache lifetime.
- Storage path containment uses a prefix test, which is weaker than a relative-path containment check.
- Session and visitor cookie security depend on a manually supplied environment variable; production HTTPS should enforce `Secure` in code.

## Implementation tasks

1. Add focused tests for storage containment, protected verification-media classification, and production cookie policy.
2. Add a small media-access policy that permits public advertising assets but requires the owner or an authorised verification administrator for `verify_*` uploads; return `404` to unauthorised callers without revealing document existence and use `private, no-store` for protected responses.
3. Replace prefix-based storage checks with path-relative containment checks and add `nosniff` to streamed media responses.
4. Make cookie `Secure` mandatory in production while retaining the explicit local HTTP override in non-production.
5. Run focused tests, full unit suite, typecheck, lint, Prisma validation, production build where its runtime database prerequisite allows it, and a source diff review.
6. Before any production deployment, trigger and verify the existing complete Trbhh backup workflow, commit a rollback reference, publish only to the Trbhh deployment branch, then check live health and headers.

## Speed work in this release

- Preserve the Cloudflare cache and Early Hints settings already enabled.
- Avoid caching authenticated HTML or private documents. The security change removes an unnecessary public immutable cache policy from private verification files; it does not reduce caching for public advertising media.
- Keep schema migration redesign and broad Next Image host allowlisting as separately staged changes because altering them without database/media inventory risks breaking live content.
