# Quick classification and undo

Choosing a category in the Start drive journal, day view or bulk selection
saves immediately. The control names the affected drive or selection before
saving. The persistent **Last quick classification** panel reports the actual
number changed and offers Undo. Detailed annotation forms save only with
**Save**; **Discard changes** restores the stored values without a write.
Closing or navigating away never saves a form. Leaving an edited form through
a link or browser Back/Forward asks before discarding and preserves the existing
history entries when cancelled; reloading or closing the browser uses its native
unsaved-change warning.

## Lifetime and navigation

Undo is available for **30 minutes after a successful quick classification**,
for the most recent operation in the same authenticated login session. It
survives in-app navigation and reload, including bulk operations. Another
completed quick classification in that session replaces the earlier operation,
even when it changes a different drive. An unchanged selection creates no
operation and does not replace the previous one. Tabs sharing the same login
session share the latest operation. Signing out ends access to its undo;
signing in again does not grant the new session access to an older receipt.

Expired receipts are shown honestly as expired. Attempts to undo a superseded
operation explain that a newer operation replaced it. Undo applies only to the
classifications actually changed by that operation, and never to notes,
purpose, customer, project, places, tags or classification-rule provenance.
A later classification edit from any writer invalidates affected undo,
including an edit away from and back to the same category. If any member is
changed or missing, **the entire bulk undo is rejected** without changing
another member. Review the current categories before classifying again.
Successful duplicate requests return the same completed result without adding
another change or audit entry.

## Storage, retention and recovery

Odovi stores operation membership and previous classifications in its own
`classification_operations` table, bound to the initiating user and session.
The browser sends only the operation identifier when undoing. A database
trigger increments `drives.classification_revision` on every real category
change, including worker/default/rule changes; unrelated field changes do not
invalidate undo. Undo restores classifications and appends normal annotation
audit records. The original audit history is retained. TeslaMate remains
read-only, and sync continues to preserve manual annotations.

Receipts become eligible for cleanup **24 hours after their undo window
expires**. The next quick classification that actually changes data removes
eligible receipts; an idle installation may retain them longer. Removing an
account or login session cascades deletion of its receipts. This cleanup does
not remove annotation audit history. A completed undo remains safe to retry
while its receipt exists, including after expiry or supersession; a removed
receipt is reported as unavailable.

The [supported backup and restore procedure](upgrade-odovi.md) uses a complete
PostgreSQL custom archive. It includes operations, session bindings,
classification revisions, the revision function/trigger, identity sequences,
and audit history. Restore into a fresh named volume and run the matching
application version before migration. Restoring never extends an operation's
stored expiry; an expired operation stays expired. Check a representative
classification, receipt, original and undo audit rows after recovery.

## Regression checks

Run the database regression checks against a disposable local database named
`odovi_classification_test` (never a production URL):

```bash
DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:PORT/odovi_classification_test pnpm db:migrate
ODOVI_CLASSIFICATION_TEST_DATABASE_URL=postgres://USER:PASSWORD@127.0.0.1:PORT/odovi_classification_test pnpm --filter @odovi/web exec vitest run lib/actions/drives.integration.test.ts lib/actions/drivingProfile.integration.test.ts
```

Build shared package types first, as required by the contributing checks.
The checks cover single/bulk success, session authorization, expiry,
supersession, away-and-back conflicts, missing members, concurrent requests,
idempotent retries, input validation and unchanged data after rejection.
