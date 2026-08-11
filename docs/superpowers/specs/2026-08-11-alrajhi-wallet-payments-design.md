# Al Rajhi Wallet Payments Design

## Scope and boundary

This design applies to Trbhh only. Agar is not changed in code, database, secrets, deployment, media, or Cloudflare configuration.

Trbhh is a Next.js 16 App Router application written in TypeScript, using Prisma with MySQL. It already has an operational member wallet (`users.balance`, `wallet_txns`, and `wallet_topups`) and a provider abstraction under `src/lib/payments`. The implementation extends that model without creating competing `wallets` or `wallet_transactions` tables.

## Goal

Provide a production-safe hosted checkout integration for Al Rajhi Bank that can be configured through environment variables, keeps card data outside Trbhh, and credits a member wallet exactly once only after bank-side confirmation.

## Chosen approach

Use a hosted payment page. Trbhh creates an internal top-up request and redirects the member to the bank. The browser return page never credits money by itself. The callback endpoint verifies authenticity, finds the internal request, verifies the payment with the bank, and atomically changes the request and wallet ledger.

The Al Rajhi protocol adapter is isolated from the wallet service. The bank-specific HTTP paths, field names, signing algorithm, and response mappings are configured by the merchant integration package supplied by Al Rajhi. Until that package and valid sandbox credentials are present, the provider is unavailable and no member can start a payment.

## Visual and Arabic UX

- Reuse Trbhh's navy, gold, turquoise, white, rounded-card, and RTL typography styles.
- The wallet page opens on a focused `شحن الرصيد` card with preset SAR values 10, 50, 100, 500, and 1000 plus a validated custom amount.
- The primary action is `الدفع الآمن الآن`. Its supporting copy says that card data is entered only on the bank payment page.
- A pending state shows the internal reference, selected amount, and an action to refresh payment status. It does not promise a credit before verification.
- Success shows the internal reference, paid amount, wallet balance after the ledger commit, and an invoice link. Failure displays a concise Arabic reason without exposing bank credentials or raw errors.
- The administration area uses the existing navigation and offers a `إدارة المدفوعات` page with search, status/provider/date filters, protected gateway-response inspection, and a `إعادة التحقق` action.

## Environment configuration

`.env.example` documents every non-secret name. Production secrets exist only in deployment secrets/environment, not the repository or database settings page:

```dotenv
PAYMENT_PROVIDER=alrajhi
ALRAJHI_ENVIRONMENT=sandbox
ALRAJHI_MERCHANT_ID=
ALRAJHI_TERMINAL_ID=
ALRAJHI_USERNAME=
ALRAJHI_PASSWORD=
ALRAJHI_SECRET_KEY=
ALRAJHI_API_KEY=
ALRAJHI_API_BASE_URL=
ALRAJHI_HOSTED_PAYMENT_URL=
ALRAJHI_SIGNATURE_ALGORITHM=
ALRAJHI_WEBHOOK_HEADER=
CALLBACK_URL=https://trbhh.com/api/payment/callback/alrajhi
RETURN_URL=https://trbhh.com/payment/result
CANCEL_URL=https://trbhh.com/payment/failed
DATABASE_PAYMENT_SECRET=
```

`DATABASE_PAYMENT_SECRET` is a 32-byte application secret used to encrypt retained bank payload fields at rest. Logs contain redacted summaries and correlation IDs only. Missing, known-invalid, or development values fail closed in production.

## Data model

Existing `wallet_topups` remains the payment request record and retains compatibility with current manual top-ups. A migration adds fields required for online bank reconciliation:

| Field | Purpose |
| --- | --- |
| `transaction_id` (unique) | Opaque internal public reference, never a predictable integer |
| `currency` | Fixed to `SAR` for Al Rajhi top-ups |
| `gateway_status` | Normalized `pending`, `success`, `failed`, `cancelled`, or `refunded` state |
| `gateway_response_enc` | Encrypted, bounded provider response payload |
| `idempotency_key` (unique) | Prevents duplicate create requests |
| `callback_hash` (unique nullable) | Records a verified callback fingerprint |
| `failure_code` | Sanitized member/admin failure categorisation |
| `verified_at` | Time the provider query authenticated the final state |

`wallet_txns` remains the financial ledger. A successful online top-up creates one positive `topup` row inside the same MySQL transaction that marks `wallet_topups` successful and adjusts the existing member balance. The amount is stored and compared in halalas where the current wallet money migration has been completed; deployment is blocked if the consistency check fails.

## Service boundaries

```text
Wallet page / admin recheck
        |
PaymentService
        |-- TopupRepository: request state and idempotency
        |-- AlRajhiHostedAdapter: create, verify, signature, refund
        |-- WalletLedger: atomic balance and ledger entry
        |-- PaymentAuditLog: redacted event log
        |
Al Rajhi hosted checkout and server callback
```

`PaymentService` exposes `createPayment`, `verifyPayment`, `handleCallback`, and `refundPayment`. Its public result types do not expose card data, secrets, or raw gateway payloads. The adapter is selected only from an allow-list; incoming callback route parameters cannot select arbitrary code or URLs.

## Payment lifecycle

1. An authenticated member submits a server action with a preset or custom amount.
2. The server validates the amount, currency, configured minimum/maximum, current account, and an idempotency token. It never accepts a client-supplied user ID, final amount, success state, or wallet balance.
3. It creates a pending `wallet_topups` record with a cryptographically random `transaction_id` and idempotency key.
4. The adapter creates a hosted Al Rajhi payment session using server-side credentials and returns only the bank redirect URL.
5. Browser return displays an intermediate result and calls server-side verification; it does not credit a wallet.
6. Callback authenticates the message using the Al Rajhi contract, compares its request reference and expected amount/currency, and then queries the bank by its provider reference.
7. In a MySQL transaction with a conditional state update, the service changes the top-up to success, adds exactly one ledger entry, updates the balance, and writes the encrypted verified response.
8. A repeated callback, refresh, or administrator recheck reads the already-successful result and cannot add a second credit.
9. Failed, cancelled, and expired requests retain an audit record but make no ledger entry.
10. A refund requires an already verified successful top-up, a bank-side refund result, and a reversal ledger entry in the same state transition. It is administration-only.

## Callback and security controls

- HTTPS is required by production configuration; callback and return URLs are generated from the canonical `SITE.domain`, not request headers.
- The exact Al Rajhi signature algorithm, signed fields, header, and timestamp tolerance are defined in the bank-issued integration guide and implemented in the adapter; unverifiable callbacks return a generic acknowledgement but create no state change.
- Callback payload size, content type, provider ID, signature, timestamp, and replay fingerprint are checked before a provider verification call.
- The database enforces unique transaction, idempotency, and callback fingerprints. Conditional updates and MySQL transactions protect concurrent callbacks.
- The final amount and `SAR` currency are compared against the original pending database record and the trusted bank verification result, in halalas.
- Payment endpoint and callback logs redact Authorization, API keys, passwords, card fields, signatures, and encrypted response contents.
- Only staff with the payment-management permission can search records, inspect redacted response metadata, trigger re-verification, or initiate a refund.
- No credentials are stored in source control, client bundles, browser local storage, or application settings tables.

## Sandbox and production gate

The implementation ships with the provider disabled. Sandbox activation requires all documented variables, an Al Rajhi-issued base URL and hosted-payment endpoint, the exact contract version, and a successful bank test transaction. Production activation requires the same checks using production values, HTTPS callback reachability, approved merchant identifiers, a test checklist run, and a backup/rollback point.

## Test matrix

Automated unit and integration tests cover:

- valid hosted payment creation with a server-owned amount;
- rejected amount manipulation and missing configuration;
- signature failure, replay, unknown reference, amount/currency mismatch, and malformed callback;
- successful callback credits exactly once;
- duplicate callback, browser return after callback, and concurrent verification cannot double-credit;
- bank refusal, timeout, and unavailable provider keep the request non-successful;
- unverified requests cannot create a wallet ledger credit;
- staff-only recheck/refund controls;
- protected logs and encrypted response storage;
- manual sandbox checklist: successful payment, declined payment, disconnected verification query, duplicate callback, and forged callback.

## Delivery and deployment

The delivery includes migrations, API documentation, `.env.example`, a merchant activation runbook, Arabic UI, administration views, test coverage, and an isolated Al Rajhi adapter. Before production deployment, run all tests, typecheck, lint, Prisma validation, migration checks, sandbox tests, complete Trbhh backup, deployment, and post-deploy health/header checks. The rollback reference is the pre-deployment Trbhh SHA and its backup artifact.
