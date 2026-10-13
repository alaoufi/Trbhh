# Private CJ fulfillment runtime

The release injects CJ_FULFILLMENT_WORKER_ENABLED and CJ_LIVE_TRIAL_ENABLED with a default of false. Runtime preservation accepts only an absent flag becoming false; all existing gate values and SUPPLIER_ALLOW_LIVE_ORDERS are preserved. A release never enables financial processing or public commerce.

The existing verified finance release installs an independent trbhh-cj-fulfillment.service and timer only during finalization after public HTTPS and data/runtime preservation checks. Every five minutes the bounded host job checks one supplier status and, only with both live-order and worker gates enabled plus the application policy, attempts one queued dispatch. Credentials stay inside the application container. Service timeout is 140 seconds; host-job timeout is 130 seconds and a nonblocking lock prevents overlap.

Before cutover the release snapshots only these two unit files and their timer enabled/active states, then stops the timer and service. Rollback restores the baseline application first, restores prior CJ unit bytes (or prior absence), and restores enabled/active states. Partial installation and repeated rollback are supported. Unexpected unit edits and symlinks are rejected rather than overwritten. Existing finance receipt capture and rollback watchdog continue independently.

Financial activation requires a separate approved operational decision and fresh supplier balance validation. This change neither writes customer data nor changes CJ flags in the host environment. Installation has not been performed by local tests.
