# Driving profile and classification

The overview asks once how you mainly use each vehicle: **mostly private**,
**mostly business**, or **balanced**. Save a choice explicitly. You can change
it later under **Settings → Driving profile**.

Private and business profiles provide a default for completed drives that
start after you save that choice. The sync worker applies it after your own
classification rules. Balanced leaves drives without a matching rule open
for individual classification. A rule that only adds a purpose or tag still
allows the default classification; a rule explicitly choosing unclassified
keeps the drive open.

Saving a profile does not change existing drives. Delayed syncs use the drive's
start time, so importing old history or running a full resync does not turn it
into new driving activity. Saving the same choice preserves its original
start boundary; changing the choice sets a new boundary. Manual corrections,
including returning a drive to unclassified, survive subsequent syncs.

To apply your current default to the backlog, choose **Mark open drives as
private/business** next to **Classify now**. This explicit action includes
completed unclassified drives for that vehicle, including historical imports.
It preserves already classified drives, ongoing drives, notes, tags, and other
vehicles. The overview count shows this completed backlog, with an additional
label for imported drives.

The result offers **Undo**. Undo restores the batch's classifications while
keeping drives that someone edited in the meantime. Both automatic and manual
changes remain in the audit log. Individual quick classifications in the
overview also offer Undo; drive notes and other form fields use explicit Save.

Profiles are vehicle-specific settings in the existing Odovi database. Normal
database backup and restore includes them and their audit records. This feature
does not change the TeslaMate database or require another provider or service.
