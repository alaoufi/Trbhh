# Strict Phone Registration Design

## Goal

Require a successful Saudi OTP verification before a public account is created or a session is issued. Route non-Saudi numbers to an admin-reviewed international registration request instead of creating an account.

## Scope

This change applies only to the Trbhh production branch. It does not change Agar Trbhh, existing accounts, payment settings, or account-recovery OTP flows.

## Registration flows

### Saudi self-registration

1. The visitor enters name, a Saudi number, password, and agreement to the terms.
2. The server canonicalizes and accepts only `05XXXXXXXX`, `5XXXXXXXX`, `9665XXXXXXXX`, `009665XXXXXXXX`, or `+9665XXXXXXXX` as one Saudi mobile format: `05XXXXXXXX`.
3. The server validates the name, password, terms, and duplicate number before sending an OTP.
4. It stores no user record and creates no session at this stage. It stores only the short-lived registration intent and sends a 4-digit OTP to that exact Saudi number.
5. The visitor enters the OTP. A correct, unexpired OTP creates the user, sets the canonical Saudi phone, records the verified-phone state, consumes the OTP/intent, and then creates the session.
6. Incorrect OTPs, expired OTPs, exhausted attempts, or delivery failures never create a user or a session. The UI explains the exact next action.

### International registration request

1. When the phone is not Saudi, the visitor is shown a separate "طلب تسجيل دولي" form, not an OTP field.
2. Country is mandatory. The form also requires name, full international phone, email, reason for registration, password, and agreement to the terms.
3. Submission creates an `international_registration_requests` record with status `pending`; it creates neither a user nor a session.
4. The response tells the visitor that the request is pending administrative review. It does not disclose whether a similarly named request exists.
5. The administration sees all pending/approved/rejected requests with country, contact details, reason, and time. It may approve (create the user without a session and mark the request approved) or delete/reject (store an internal reason and remove/mark the request according to the selected action).
6. A manually approved international account is created with no Saudi phone verification claim and no automatically enabled public phone/WhatsApp flags. The administrator supplies the first login password only through the approved manual operating process.

## Security rules

- All number-policy validation is server-side; HTML input restrictions are usability only.
- Only Saudi OTP sends use the existing domestic SMS/WhatsApp configuration. International numbers never reach that provider through registration.
- Registration OTPs are separated from password-reset OTPs by purpose, so a reset OTP cannot authorize account creation.
- OTP intent holds a password hash, never the plain password. It expires after 10 minutes and is consumed on successful registration.
- Maximum five verification attempts apply to each active intent. Re-sends cannot reset the attempt count, and repeated sends have a short cooldown.
- The user is created inside a database transaction after successful OTP validation; duplicate races result in a safe "number already registered" response.
- International requests are rate-limited by normalized phone and email, and no user/session is created before an administrator approves.
- The old direct `registerAction` path is removed so crafted requests cannot bypass the OTP page.

## Components

- `src/lib/phone-registration.ts`: pure Saudi phone normalization/validation and testable registration policy helpers.
- `src/lib/registration-otp.ts`: registration-intent persistence, OTP creation, verification, cooldown, and consumption; it reuses the configured sending channel but not password-reset OTP rows.
- `src/app/register/actions.ts`: server actions for starting Saudi registration, confirming Saudi OTP, and submitting international requests.
- `src/app/register/page.tsx`: two-stage Saudi registration UI and international request handoff.
- `src/app/register/international/page.tsx`: international request form and clear pending result.
- `src/app/admin/international-registrations/page.tsx`: restricted administration queue.
- `src/app/admin/actions.ts`: permission-protected approval/rejection actions.
- `src/data/schema-sync.ts` and `prisma/schema.prisma`: schema-on-read table definitions/models for registration intents and international requests.
- `tests/unit/phone-registration.test.ts` and `tests/unit/registration-otp.test.ts`: policy and OTP lifecycle tests without a live SMS service.

## Error handling and user messages

- Non-Saudi visitor: "التسجيل الإلكتروني متاح حالياً للأرقام السعودية فقط. يمكنك إرسال طلب تسجيل دولي للمراجعة."
- Saudi number invalid: "أدخل رقم جوال سعودي صحيحاً يبدأ بـ 05."
- Delivery disabled/misconfigured: "تعذّر إرسال رمز التحقق حالياً. حاول لاحقاً أو تواصل مع الإدارة." No account is created.
- Wrong/expired OTP: "الرمز غير صحيح أو منتهي الصلاحية. اطلب رمزاً جديداً."
- Duplicate verified number: "رقم الجوال مسجّل مسبقاً."
- Pending international request: "تم استلام طلبك. ستراجعه الإدارة قبل إنشاء الحساب."

## Tests and release checks

1. Unit tests prove Saudi normalization accepts all supported Saudi representations and rejects Algeria/international/malformed numbers.
2. Unit tests prove an OTP intent expires, limits attempts, retains attempts across resend, and is consumed once.
3. Server-action tests or focused integration checks prove neither a Saudi unverified submission nor an international request creates a `users` row/session.
4. Focused lint, TypeScript check, and affected Vitest suites run before commit.
5. Before production deployment, run the existing full Trbhh backup workflow and create a rollback tag. Deploy only the Trbhh branch and verify `/register`, the Saudi OTP screen, and the international request page with read-only HTTP checks. Do not deploy the Agar branch.

## Non-goals

- International SMS OTP delivery.
- Changing phone verification/recovery behavior for existing accounts.
- Automatically emailing passwords to internationally approved applicants.
- Applying any policy or database change to Agar Trbhh.
