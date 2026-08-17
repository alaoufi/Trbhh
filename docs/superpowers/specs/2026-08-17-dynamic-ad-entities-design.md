# Dynamic Ad Entities - Design

## Decision

Build Dynamic Ads as a parallel, hidden pilot.  The established `ads` table,
public listing, prices, categories, stores, and existing publish flow remain
unchanged.  The pilot has its own records and is reachable only by authorised
administrators and a deliberately shared, authenticated test URL.  No pilot
record can enter public listings.

## Why this approach

1. Replacing category IDs everywhere would risk every existing ad, price rule,
   saved search, and store integration.
2. A JSON-only document store is easy to start but makes type-aware filtering,
   validation, and later indexing unreliable.
3. The selected design stores schema separately from values: entity definitions
   and fields are admin-managed, while each draft stores a JSON object and a
   normalised value row per field.  It is extensible without a deploy and is
   queryable without changing columns for new entity types.

## Data model

`dynamic_entities` has stable `key`, Arabic name, icon, active flag, and order.
`dynamic_entity_fields` has entity ID, stable key, Arabic label, field type,
required/searchable flags, display order, and JSON options.  Supported types
in the pilot are text, textarea, number, select, boolean, date, location, and
media.

`dynamic_advertisements` is a private draft/analyser record.  It retains the
author, optional entity, title, description, price, location, status,
confidence, quality score, extracted JSON, missing-field JSON, suggestions
JSON, a content fingerprint for caching, and timestamps.  `dynamic_ad_values`
normalises the values used by filters.  `dynamic_analysis_feedback` records an
explicit user choice or correction for later rule tuning; it is never used to
silently change an advertisement.

The initial seed is Vehicle, Property, Livestock, Product, Service,
Equipment, and Other.  Entity fields are data, not React code.  Seeds provide
the requested Arabic labels and options, and an administrator can add another
entity or field in the pilot without modifying source.

## Analysis and safety

The fast analyser is deterministic and local.  It scores Arabic keyword and
pattern rules against title and description, extracts year, mileage, area,
room count, and numeric price hints, and produces missing required fields and
quality suggestions.  It uses no external AI service and sends no member data
outside Trbhh.  A fingerprint caches the result per identical input.  A later
optional model adapter can run only when confidence is below the configured
threshold; it is disabled by default.

The analyser is advisory: its inferred entity never overwrites a user's
selection.  Choosing “دع الذكاء يحدد” stores no entity until analysis provides
one, and the user can always accept another entity.

## Hidden pilot journey

An authorised user opens `/lab/smart-ads` while authenticated.  The server
checks an allow-list setting and returns 404 for everyone else.  They select an
entity or automatic detection, fill the schema-driven fields, and click
Analyse.  The page saves a draft with `status=draft`; it neither writes to
`ads` nor uploads media to public ad storage.  The internal analyser view is
`/lab/smart-ads/[id]/analyze`, has `noindex,nofollow`, and presents entity,
confidence, extracted values, omissions, quality, suggestions, and a local
final preview.

There is intentionally no “Publish to Trbhh” button in the pilot.  Its future
activation requires a separate approved migration mapping an entity to the
legacy public ad record and reusing all existing moderation, wallet, rate,
duplicate, and visibility checks.

## Administration and search

`/admin/smart-ads` is protected by `ads:edit` and provides tabs for draft
queue, incomplete records, ready records, entities, fields, rules, and
accuracy feedback.  It is shown only to authorised staff.  The hidden search
endpoint uses entity/value filters and a tokenised text score; it is limited,
indexed, and available only in the lab.  This establishes the scalable search
contract before a public search replacement is considered.

## Rollout and rollback

The database migration uses `CREATE TABLE IF NOT EXISTS` and inserts seed rows
idempotently.  It runs before the hidden UI is enabled.  A feature setting
`smart_ads_lab_enabled` defaults to `0`; deployment therefore changes no
visitor journey.  Before production deployment: full backup, commit SHA, and
health check.  Rollback is the previous deployment SHA; data tables may remain
unused safely because no production `ads` records reference them.

## Acceptance criteria

- The existing public add-ad and public listing flows are unchanged.
- An authorised tester can create and analyse a hidden draft for each initial
  entity, including auto detection.
- A newly created entity/field appears in the form without a build or deploy.
- The analyser returns deterministic entity/confidence/extractions/missing
  fields/quality and caches duplicate input.
- Unauthorised visitors receive 404 and pages are not indexable.
- Database and unit tests cover validation, entity schema, analysis, access,
  search filters, and idempotent bootstrap.
