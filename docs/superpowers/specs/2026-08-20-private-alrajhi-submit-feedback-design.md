# Private Al Rajhi Submit Feedback Design

## Goal

Make the private Al Rajhi top-up form visibly busy while it creates a bank session, with a default test amount of 50 SAR and no duplicate submissions.

## Design

The server-rendered private page continues to own authorization, configuration status, amount limits, and the server action. A small client-only submit control uses React form status to show a spinner and the Arabic message "جاري إنشاء العملية الآمنة... لا تغلق الصفحة" immediately after submit. It disables the amount input and submit button while pending.

The form remains a redirect flow: Trbhh collects only the amount, then the official Al Rajhi Hosted Payment page collects card and OTP data. No card details are accepted, rendered, logged, or stored by Trbhh.

## Acceptance Criteria

- The amount input initially contains 50, subject to existing configured min/max validation on the server.
- A submit switches to a visible loading state and disables all form controls until redirect or server response.
- The loading message tells the operator not to close or refresh the page.
- The existing bank-session and wallet-credit controls remain unchanged.
