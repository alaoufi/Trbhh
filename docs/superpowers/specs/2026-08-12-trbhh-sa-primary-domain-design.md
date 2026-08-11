# Trbhh.sa primary domain

## Goal

Make `https://trbhh.sa` the single preferred public URL for the Trbhh platform
in Google Search, while preserving `trbhh.com` as a safe entry URL and leaving
all `*.trbhh.com` store subdomains unchanged.

## Design

1. Set `trbhh.sa` as the application site domain used to generate metadata,
   Open Graph URLs, JSON-LD, robots and the XML sitemap.
2. Add an explicit canonical URL for the home page and retain page-level
   canonical URLs under the primary host.
3. Permanently redirect only the apex `trbhh.com` host to the same path and
   query string on `trbhh.sa`. Never redirect a store subdomain.
4. Verify generated robots and sitemap URLs, redirect behavior, TypeScript and
   test suite before deployment. Create a production backup before deploying.
5. After deployment, submit `https://trbhh.sa/sitemap.xml` in the verified
   Google Search Console property and request indexing of the home page.

## Non-goals

- No change to Agar or its domains.
- No change to `*.trbhh.com` store routing.
- No claim that Google indexing is immediate; Google controls crawl timing.
