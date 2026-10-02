# Archive navigation and feedback

These workflows document unreleased changes in the current source checkout.
Published installation behavior is described by the [stable release notes](releases/0.4.0.md).

Home puts archive search, unclassified drives and the day entry ahead of optional
vehicle details. The day view shows its measured totals before the timeline;
missing and estimated energy retain their labels. Export and recap remain
secondary actions. Tire-pressure warnings remain visible in the compact vehicle
summary, and optional weather loads independently of the archive.

## Search scope

The selected vehicle, result type and date range describe the rendered results.
A bare `/search` starts with guidance. Explicit `type=drives`, `type=charges`
and `type=all` query that type even without another restriction. Invalid types
use the drives default without activating a search by themselves.

Remove text, dates or classifications individually, or use **Reset to all
drives**. Reset retains the vehicle and explicitly selects drives; it removes
text, dates and classification restrictions. Results and controls commit
together. During an update, the existing results are marked as belonging to
the previous filters. Input focus and scroll remain in place. Failures retain
the filters and provide a retry.

## Returning from a drive

Day and search links carry a local `returnTo` URL with only the list's filters,
vehicle and drive anchor. A day reached from the calendar also retains its
origin month. **Back** on the drive returns to that list and focuses the drive
link. Browser Back/Forward retain their normal history and scroll behavior;
reloading a drive preserves its explicit return URL.

A direct drive link without context returns to that drive's day and vehicle.
External URLs and other application routes cannot become return destinations.
No personal query history is stored. Changing vehicles clears transient bulk
selection; selection is never represented as saved archive data. Annotation
forms ask before discarding unsaved edits and warn on reload or tab close.

## Feedback

Optional data loading reserves content space and announces a short status.
Day, month and search navigation retain the previous content while refreshing,
with an explicit pending message and no invented freshness information.
Local view failures offer retry. Required
application-service failures retain the global readiness recovery surface.
Optional-provider failures stay with their content and do not mark the archive
unavailable. Classification, annotation and undo errors remain accessible until
the user retries or dismisses the affected operation.

The shared Paper & Ink palette, page typography, cards and buttons are the
visual reference for compact and wide archive views. Forms use visible
boundaries, keyboard focus, native controls, and the existing reduced-motion
and zoom settings. Charts and the recap retain their task-specific layouts.
