# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-09-08

### Added
- Vehicle driving profiles for future completed drives, with explicit application to unclassified history and guarded undo.

### Changed
- Paper & Ink application styling, a clearer overview and faster drive classification.
- Continuous, distance-based journey and day recaps with shorter sections for short trips and distinct charging-stop cards.
- Locale-aware numeric and ongoing-session formatting on overview, day and drive views.

### Fixed
- Clearing a manual charging price immediately restores the available place tariff and updates the form.
- Rapid recap chapter selection retains every keyboard step.

## [0.3.0] - 2026-09-07

### Added

- Compare the latest 5 or 10 completed DC charging sessions, including charging
  curves, observed average and peak power, 10–80% timings, and location rankings.
  Missing measurements and slower-session comparisons are explicitly qualified.
- Explore yearly destination visits with a year and drive-classification filter,
  top destinations, and the existing map-provider activation controls.
- View an annual Wrapped with driving totals, classification and monthly
  distance, longest drive, favorite and farthest destinations, and charging costs
  kept separate by currency. Print or save the report as a PDF in the browser.
- English and German copy, keyboard-accessible controls, and mobile layouts for
  the new analysis views.

### Fixed

- Keep Calendar in the mobile navigation and make Search available in the
  header; secondary destinations retain an active navigation state.
- Keep Insights selected when viewing the annual Wrapped.

## [0.2.0] - 2026-08-27

### Added

- A mobile "More" hub keeps the five-item bottom navigation focused while
  exposing planning, analysis and configuration capabilities by intent.
- Saved roadtrip plans now show a leg-by-leg plan-versus-actual comparison and
  can refresh newly synchronized Journey items on demand.
- Explicit charging checkpoints support target SoC values and estimated charge
  times derived from the vehicle's own DC charging history.

### Fixed

- Vehicle-dependent pages now explain how to finish setup instead of showing an
  incorrect not-found state on fresh installations.

### Changed

- Start new `0.2.x` versions under FSL-1.1-ALv2. Previously published releases
  and branch commits remain available under AGPL-3.0 for copies received under
  those terms.
- Clarify separate terms for the marketing site, brand assets and external
  contributions.

## [0.1.1] - 2026-07-08

### Fixed

- Route planner: selecting a destination from the address search was
  immediately discarded, so "Check range" always asked to pick a destination.
  Selected addresses are now retained.

## [0.1.0] - 2026-07-08

### Added

- Trip archive with day view.
- Classification, tags, and audit log.
- Places with geofences and map picker.
- Calendar, search, and monthly reports with CSV/PDF export.
- Journeys with CSV/PDF/GPX export.
- Trip and charging analytics with maps, charging curves, and weather.
- Insights.
- Start dashboard.
- Tessie import.
- Automatic classification rules.
- Bulk editing.
- Automatic charging costs per place.
- Route planner (experimental).
- Dark mode.
- Mobile optimization.
- Internationalization in German and English.
