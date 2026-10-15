# Local intelligence implementation plan

Goal: Local-only Arabic/English translation and intent-aware CJ search; no financial behavior changes or deployment.

Architecture: A bounded Ollama client accepts structured output from a local model. Existing translation cache, glossary and LibreTranslate stay in place. Search tries at most three intent-preserving queries, retaining all existing filters. No external inference fallback. Models update through a daily host timer, validate a candidate before switching an active alias, and retain a rollback alias. Runtime image upgrades remain separate from model updates.

- [x] Add failing client tests for local-only endpoints, structured output, outage, concurrency, query constraints and no cloud fallback.
- [x] Implement local client and replace remote translation providers; retain manual/cache precedence and source chunk integrity.
- [x] Integrate bounded semantic query alternatives into current browse page and update admin settings.
- [x] Add isolated service configuration, model updater, hourly/daily scheduling instructions and rollback validation tests. Do not execute deployment.
- [x] Run unit suite, typecheck, lint and build; save and push only the non-deploying work branch.

Live gates remain: verify VPS memory/CPU/disk, download model, test real Arabic meanings/translation quality and latency, verify private network exposure and timer. Local unit tests cannot prove these.

Verification: full suite 2994 passed / 9 skipped; 2 additional client-boundary tests passed afterward. Build, typecheck and lint passed (14 existing warnings). Docker/Ollama are unavailable on this workstation, so real-model quality, Compose runtime and the VPS timer are not live-verified.
