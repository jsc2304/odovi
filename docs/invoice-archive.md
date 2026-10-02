# Tesla invoice archive

Open **More → Tesla invoices** (`/invoices`) and enable invoice imports. The
archive is optional and disabled for imports by default. It runs locally and
does not connect to Tesla or an external document service. Disabling imports
retains existing documents, review, downloads, exports and deletion.

Import a complete PDF or a ZIP containing PDFs and optional directory entries.
Odovi keeps the exact uploaded PDF/ZIP, each original PDF, SHA-256 hashes,
extracted text, parser version, parsed metadata, import actor/time and index.
An identical upload is idempotent. A different ZIP containing a previously
archived PDF is rejected; remove duplicate entries before importing it.
Any invalid member rejects the entire upload without storing partial records.

## Review and matching

Text extraction supports ordinary PDFs. There is no OCR for scanned documents.
The initial parser recognizes explicit English/German invoice-number and
invoice-date labels, VIN, charging start with an ISO timestamp and time zone,
delivered energy, and totals with a stated EUR/CHF/GBP/USD currency. Other
layouts remain archived with unknown fields. Check the original PDF and fill
in missing values; reviewed metadata is retained separately from immutable
parser output. More currencies can be entered as three-letter currency codes.

Suggestions consider only completed DC charging sessions. A **matched**
suggestion requires a unique candidate with the same VIN, a start within two
minutes and delivered energy within 0.2 kWh. Other candidates within ten
minutes and 1 kWh are **probable**. Without a charging timestamp, the invoice
date gives a wider search window and can only produce probable suggestions.
Missing identifying data, ambiguity or more than 50 candidates cannot produce
a confident match. Suggestions never change costs. Review and save the
charging session ID to confirm a match, or leave it blank to retain an
unmatched record. A known VIN must agree with the selected vehicle.

Cost enrichment is a separate, explicit checkbox after checking the amount,
currency and session. It may replace only an empty cost with no source or an
automatic place-tariff cost. Manual and TeslaMate/imported values are
protected. Odovi stores the exact prior amount, currency and source, gives the
new value a unique invoice source, and appends an audit record. TeslaMate is
never written. The worker cannot overwrite invoice costs during a tariff
recalculation. Manual edits to an enriched charge remain possible.

## Export and deletion

The monthly evidence ZIP contains original PDF bytes and `manifest.json` with
hashes, parsed/reviewed metadata, parser version, original upload provenance,
confirmed charge IDs and prior/applied cost triples. Once reviewed, the
reviewed invoice date governs, including clearing an incorrect parsed date to
unknown. Without review, the parsed date is used. An unknown date falls back
to UTC import date. The original ZIP can be downloaded separately. Keep downloaded
bundles private. At most 500 PDFs/100 MiB of original PDF bytes can be exported
at once; the UI shows the latest 100 records, while export includes all
records for the selected month.

Deletion acts on the **entire original upload**, including every member of a
ZIP. This avoids retaining a deleted invoice inside an otherwise kept ZIP.
The UI asks for confirmation. For each enriched session, deletion restores
the prior cost/source only if its exact applied amount, currency and unique
invoice source are still present. Later changes are preserved and reported.
Original blobs and index rows are deleted in the same transaction; the audit
retains hashes and the history of enrichment/deletion, not the PDF bytes or
extracted text. An enriched invoice must be deleted/reimported to change its
assignment. Deletion does not remove earlier backups or downloaded exports.

## Storage, limits and recovery

The supported Compose installation uses the existing named PostgreSQL volume
(`ODOVI_DB_VOLUME_NAME`, default `odovi-db-data`) as the shared persistent store
for web and worker. Originals use PostgreSQL `bytea`; application containers
do not store documents in temporary/local directories. Database credentials
and normal non-root application users provide the ownership boundary; there
is no writable application directory or second archive volume to provision.
The database container has no published port in the production Compose file.

Limits are 20 MiB per request, 5 MiB per PDF, 50 ZIP entries, 20 MiB total ZIP
expansion, 100:1 expansion per entry, 20 pages and 200,000 extracted characters
per PDF. Encrypted archives/PDFs, nested non-PDF archives, special files,
unsafe/duplicate ZIP names, CRC mismatches and incomplete PDFs are rejected.
The whole parsing job has 15 seconds and an isolated Node process with a
192 MiB JavaScript heap, without inherited credentials, URL input, rendering,
PDF JavaScript/evaluation or external requests. The supported runtime is the
repository's current Node 22 Docker image (Node >=22.15). Only one import
parser runs per web process; concurrent requests receive a retryable busy
response. The archive allows 1 GiB of original bytes, counting uploaded
containers and individual PDFs separately. These are bounded personal
archive limits, not a high-volume document service.

Imports, review, quota enforcement and deletion serialize through a database
transaction lock, including across replicas. Indexes prevent duplicate
originals and double assignment to one charge. An interrupted import/deletion
rolls back; it has no filesystem cleanup step. Download/export verifies the
stored hash before returning an original. A hash mismatch returns an error:
preserve the database and inspect/restore a verified checkpoint rather than
editing the hash to conceal the mismatch.

Use the existing supported backup utility described in
[Upgrade Odovi](upgrade-odovi.md#2-rehearse-recovery-and-take-the-update-checkpoint)
and [Restore or roll back](rename-to-odovi.md#5-restore-or-roll-back). Stop web,
worker and migrations before the checkpoint. Its private custom-format
`pg_dump` includes invoice original blobs, index, metadata, enable setting,
audit and charge provenance in the same archive. No extra archive-directory
backup is required. Keep `.env`, Compose/proxy overrides and encryption keys
separately as the existing procedure requires. Restore with the utility into
an empty database in a fresh named volume; preserve the existing volume.
Before reopening access, compare downloaded originals' SHA-256 hashes,
reviewed metadata and a monthly manifest, confirm login and cost provenance,
and perform a deletion/reversal on disposable test data. Run the matching
application version/migrations before resuming writes.

This feature adds an Odovi schema migration. Existing versioned release
images/Compose assets do not gain it automatically; follow the normal accepted
release and backup/restore process before deploying a build containing it.

## Technical references

- [Mozilla PDF.js Node text extraction](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs)
- [PDF.js document options](https://mozilla.github.io/pdf.js/api/draft/api.js.html)
- [yauzl lazy entries and size validation](https://github.com/thejoshwolfe/yauzl#readme)
- [Node subprocess controls](https://nodejs.org/api/child_process.html#child_processforkmodulepath-args-options)
- [PostgreSQL dump coverage](https://www.postgresql.org/docs/17/app-pgdump.html)
