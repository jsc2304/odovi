# Journey recap

The journey recap is an authenticated, immersive presentation of an existing
journey. It is available at `/journey-recap/[id]` and linked from the regular
journey detail page. The same experience is available for a single calendar day
at `/day-recap/[date]` when that vehicle has at least two drives on the day; the
day view exposes the entry point and preserves the selected vehicle.

## Interaction model

- Every intro, drive, charging stop, and finale is a real full-viewport section
  in the document flow. Scrolling therefore moves content through the viewport
  instead of only swapping text in a fixed stage.
- The active chapter is derived from the actual center positions of those DOM
  sections. Play, chapter dots, and arrow controls scroll to the real section
  center; they must not estimate targets from a fixed pixel height or an equal
  percentage of the document.
- Starting Play between two chapters first snaps to the nearest chapter. Manual
  wheel, touch, or navigation-key input pauses autoplay.
- The speed control changes both the delay between chapters and the animated
  transition duration. Reduced Motion disables autoplay and smooth movement.

## Route scene

The background scene is a lightweight Canvas projection, not a separate 3D
framework. GPS points use `[latitude, longitude]` coordinates normalized across
the complete journey:

- longitude maps to the horizontal east-west axis;
- increasing latitude maps north and is always projected towards the top of the
  viewport;
- camera yaw stays fixed so zoom, tilt, pointer parallax, and camera travel do
  not rotate the compass orientation;
- the current route point is the camera focus, the completed route is drawn as
  a bright trail, and the remaining route stays visible as a subtle guide;
- chapter transitions interpolate route progress and alternate zoom levels.

A small north marker makes the stable orientation explicit. Semantic journey
content remains HTML above the decorative `aria-hidden` canvas.

## Mobile navigation

`/journeys` is a first-class item in the mobile bottom navigation. The recap
uses its own full-screen layout but remains session-protected server-side.

## Verification

Run the focused derivation tests and a production build:

```bash
pnpm --filter @tripatlas/web test -- --run lib/journeyRecap.test.ts
pnpm --filter @tripatlas/web lint
pnpm --filter @tripatlas/web build
```

Browser verification should cover desktop and an iPhone-sized viewport. In
particular, pause between two chapters, press Play, and verify that the selected
section is centered exactly before autoplay continues.
