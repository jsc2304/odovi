# Journey and day recaps

The authenticated recap at `/journey-recap/[id]` presents an existing journey.
The same experience is available at `/day-recap/[date]` when the selected
vehicle has at least two drives. Each drive and charging stop remains an
individually reachable chapter between the introduction and summary.

## Playback and navigation

The page has one persistent scene and one visible chapter. Scroll sections are
weighted by drive distance: short drives take less time and scroll distance,
while longer legs have more room. Charging stops hold the last reached route
position. Playback advances continuously using elapsed time; it does not stop
at every chapter and then jump to the next one.

Scroll position determines route progress and the active chapter. Adjacent
segments share bounded interpolation tangents, so forward and backward travel
preserve position and velocity at their boundaries. The camera applies a
small time-based damping step rather than restarting at chapter changes.

- Play resumes at the current position. At the finale, it restarts the recap.
- Wheel, touch and navigation-key input pause automatic playback.
- Previous/next buttons and the chapter range control reach every item.
- The speed control adjusts continuous playback speed.
- Skip to finale shows the complete route and recorded totals.
- Reduced Motion shows a stationary overview with manual chapter navigation.

The introduction, drive text and charging cards use the application's light
and dark themes. Charging cards are distinguished through a warm surface,
colored edge, icon and numbered charging-stop label. The active route marker
and chapter navigation also identify charging.

## Recorded route

The Canvas scene uses actual `[latitude, longitude]` data in timeline order.
Geographic distance determines movement along the route; GPS sampling density
does not determine the duration of a leg. Longitude is corrected for latitude,
and geographic north stays at the top of the scene.

GPS gaps can move the camera between available tracks but are not painted as
recorded driving. A drive without GPS holds the last known route position.
The originally planned route, when present, is drawn separately as a dashed
line. Neither generated scenery nor decorative contour rings claim to be
recorded roads or measured terrain.

Geometry is bounded for long journeys while retaining track endpoints. The
canvas persists across chapter changes and skips repainting when the scene is
stationary. Semantic chapter content remains HTML; the canvas is decorative
and hidden from assistive technology.

## Responsive behavior

On narrow screens the route sits above the chapter content. Long content can
scroll within its panel without horizontal overflow. Touch address-bar-only
resizes do not rebuild the timeline. A full viewport resize, such as rotating
a device, can change the selected chapter because scroll sections use viewport
units.

## Verification

Run the route/timeline tests and the normal web checks. Browser verification
should cover short and long drives, charging pauses, missing GPS, fast forward
and backward chapter selection, finale/replay, theme and reduced-motion states.
Check both a desktop and a narrow viewport.
