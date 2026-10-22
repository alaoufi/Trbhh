# Shared category field administration — 2026-10-22

P2. User requested that repeated fields across a parent category be managed once for required/optional and shown/hidden flags, while keeping per-subcategory editing and avoiding repeated category selection.

Implementation:
- Add scope=parent editor for requirements/display. Group existing fields by stable key, label, type, options, limits and unit; compatible repeats show once, incompatible variants stay separate. Include hidden/inactive subcategories and list each group's exact affected sections. No fields are copied or deleted.
- Show mixed flag states. Default every group to keep unchanged; submit only explicitly selected patches. Required applies to visible fields only; hidden fields remain optional. Per-subcategory exceptions survive unrelated bulk saves. A later explicit bulk edit of the same group applies to the listed sections, as the UI explains; no inheritance or sticky override schema is introduced.
- Preserve category/subcategory/section in navigation and save redirects. Add in-place section selection and parent shortcuts. Existing full field editor remains the place for adding/removing definitions in one subcategory.
- Server requires categories:edit, locks the parent and current subcategory definitions, verifies the complete membership/version snapshot, validates signatures and flags, updates only changed fields_json/version, and writes a single audit event in the transaction. Kind, price/goods policy, category names, and existing ad data remain unchanged. Stale/forged/unauthorized submissions fail before writes.

Verification:
- 57 category tests passed, including new grouping, mixed-state, hidden/required, private-field preservation, no-op, stale membership/version, forged signature and authorization cases.
- Edge browser fixture at 1440/390px used actual shared editor/picker components with a local save callback: one compatible field row, mixed-state indication, one explicit patch only, preserved return destination, direct subcategory link and no horizontal overflow. Phone screenshot visually inspected. This is local UI verification, not authenticated production administration or live database execution.
- Full suite: 3628 passed, 9 skipped, one Prisma CLI child-process timeout. The unchanged affected suite passed separately, 19 tests, without timeout/assertion modifications.
- Scoped ESLint and TypeScript passed; final repository checks/build recorded under work/category-shared-*.

No production deployment or live definition/data changes performed. No new tables, migrations, fees or financial operations.
