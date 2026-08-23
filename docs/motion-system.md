# Tripatlas Motion System

Stand: 22.08.2026. Dieses Dokument definiert die Bewegungssprache und die
technische Architektur der Marketingseite. Es ergänzt das
[Brand System](./brand-system.md); die Implementierung folgt erst auf Basis
dieser Spezifikation.

## Ziel

Die Website soll sich wie eine räumliche Reise anfühlen, ohne ihre Funktion als
verständliche Produktseite zu verlieren. Motion erklärt den Tripatlas-Kern:

> Aus einer erlebten Straße wird eine kontrollierbare, persönliche Erinnerung.

Der visuelle Bogen führt deshalb von **Memory Ribbon** als emotionaler
Landschaft zu **Night Cartography** als präzisem Journey-System.

## Nicht-Ziele

- keine vollständig in WebGL eingeschlossene Website;
- kein Scroll-Jacking und keine künstliche horizontale Hauptnavigation;
- kein langes Video, dessen Zeitposition permanent an den Scroll gekoppelt ist;
- keine Animation von Text, Logo oder Route innerhalb generierter Medien;
- keine Effekte, die Produktverständnis, Formularnutzung oder Mobile-Zugriff
  verschlechtern.

## Drei technische Schichten

### 1. Semantische DOM-Schicht

Navigation, Headlines, Produkttexte, Preise, FAQ und Early-Access-Formular
bleiben normales HTML. Die Seite ist auch ohne Canvas, JavaScript-Motion oder
Video vollständig lesbar und benutzbar.

### 2. Motion-Orchestrierung

GSAP ScrollTrigger steuert komplexe Kapitel, Pinning, Scrubbing und
Übergänge. Ein Kapitel berechnet seinen Fortschritt immer aus den realen
Grenzen seines DOM-Abschnitts. Globale Prozentwerte, geschätzte Pixelhöhen und
gleich große Kapitel sind keine zulässige Quelle für Positionen.

Einfache Reveals und kleine Parallax-Effekte können über CSS Scroll Timelines
progressiv ergänzt werden. Natives Scrollen bleibt zunächst unverändert;
Lenis wird nur nach einem separaten iPhone-Test erwogen.

### 3. Visuelle Bühne

Ein einzelner Three.js-Canvas liegt dekorativ hinter dem DOM und ist
`aria-hidden`. Er rendert zwei Texturen, eine kontrollierte Überblendung,
leichte Tiefenverschiebung sowie die programmatische Route. Text und
Interaktion werden nie in den Canvas verlagert.

## Storyboard

### Szene 0 — Ankommen

**Bereich:** `#start`, erster sichtbarer Viewport

**Bild:** Memory Ribbon

**Verhalten:** Der komprimierte WebP-Frame ist sofort sichtbar und bildet den
LCP. Links bleibt ruhiger Raum für Claim und CTAs. Ohne Motion ist dies bereits
eine vollständige Hero-Komposition.

Bei aktivierter Motion startet nach dem ersten Paint eine sehr kleine
Tiefenverschiebung: Nebel und Hintergrund bewegen sich langsamer als die
Lichtroute. Die Route selbst bleibt ruhig; kein autonomes Dauerflackern.

### Szene 1 — Die Reise erwacht

**Bereich:** Ende `#start` bis Beginn `#produkt`

**Scrollwirkung:** Die Kamera fährt leicht in die Landschaft. Die Cyan-
Violett-Linie gewinnt an Helligkeit, drei amberfarbene Wegpunkte erscheinen
nacheinander. Der Content scrollt weiterhin real durch das Dokument.

### Szene 2 — Erinnerung wird Atlas

**Bereich:** erste Hälfte `#produkt`

**Übergang:** Memory Ribbon verliert langsam fotografische Tiefe. Konturlinien
und die geprägte Oberfläche von Night Cartography treten hervor. Die Route
behält Position, Farbe und Laufrichtung und verbindet dadurch beide Bildwelten.

Der Übergang wird zunächst als Shader-Blend aus den beiden vorhandenen
Standbildern umgesetzt. Ein generierter Morph-Clip ist für den Prototyp nicht
erforderlich.

### Szene 3 — Journey-System

**Bereich:** zweite Hälfte `#produkt`

**Bild:** Night Cartography

**Scrollwirkung:** Eine Route zeichnet sich anhand einer echten SVG- oder
Canvas-Geometrie auf. Wegpunkte markieren Planen, Fahren, Wiederfinden und
Wiedererleben. Die visuelle Route ist Code und kann später reale Journey-Daten
verwenden; sie ist kein Bestandteil des Hintergrundbildes.

### Szene 4 — Produktbeweis

**Bereich:** Bento-Funktionen

**Scrollwirkung:** Die Kartografie weicht kontrolliert nach rechts zurück. Die
Feature-Karten treten ohne Pinning in den normalen Dokumentfluss. Route und
Wegpunkte reagieren nur noch subtil auf das aktuell sichtbare Feature.

### Szene 5 — Wahlfreiheit

**Bereich:** `#wahlfreiheit` und `#preise`

**Motiv:** Die Route teilt sich visuell in Hosted und Self-hosted und führt
danach wieder in denselben exportierbaren Datenpfad. Die Metapher erklärt
Wahlfreiheit, ohne zwei getrennte Produkte zu suggerieren.

### Szene 6 — Ankommen und Handeln

**Bereich:** `#early-access`

**Verhalten:** Die Bewegung endet. Ein letzter amberfarbener Wegpunkt bleibt
neben dem Formular stehen. Während der Eingabe findet keine dekorative
Kamerabewegung statt.

## Motion Tokens

| Token | Desktop | Mobile |
|---|---:|---:|
| Scroll-Scrub-Nachlauf | 0,45–0,7 s | 0–0,25 s |
| maximale Kameraskalierung pro Szene | 1,08 | 1,035 |
| maximale Parallaxe | 4 vh | 1,5 vh |
| Text-Reveal | 450–650 ms | 300–450 ms |
| Wegpunkt-Puls | einmalig, 500 ms | einmalig, 350 ms |
| Szenenblend | 35–45 % des Abschnitts | 45–55 % |

- Route und Scroll-Fortschritt bleiben linear gekoppelt.
- Text darf weich einblenden, aber nicht dauerhaft schweben.
- Kamera-Yaw bleibt stabil; Zoom und leichte Neigung dürfen die
  Kompassausrichtung nicht verändern.
- Easing für zeitbasierte Übergänge: `power2.out`; keine elastischen oder
  springenden Standardbewegungen.

## Generierte Assets und Code

### Generiert

- Memory Ribbon als Hero-Plate in 16:9 und später optional 9:16;
- Night Cartography als Journey-Plate in 16:9 und später optional 9:16;
- optional getrennte Atmosphären- oder Tiefenebenen;
- erst nach funktionierendem Web-Prototyp kurze Ambient-Loops, falls statische
  Shaderbewegung nicht ausreicht.

### Immer Code

- Wortmarke, Claims, Navigation und Produkttexte;
- Route, Routenausbau und echte Journey-Geometrie;
- Wegpunkte, Labels und Kapitelzustände;
- Scroll-Fortschritt, Kamera, Zoom und Übergangstiming;
- CTA-, Formular- und Accessibility-Zustände.

## Performance-Budget

- Hero-Standbild wird priorisiert; der Canvas lädt erst nach dem ersten Paint
  beziehungsweise bei Idle oder erster Interaktion.
- genau ein WebGL-Canvas und ein Renderloop;
- Device Pixel Ratio maximal 1,5 auf Desktop und 1 auf Mobile;
- maximal 2K pro Canvas-Textur, keine unnötigen HDR- oder Shadow-Maps;
- kein Postprocessing-Stack im ersten Prototyp;
- Canvas pausiert außerhalb des sichtbaren Motion-Bereichs und bei
  `document.hidden`;
- DOM-Motion beschränkt sich grundsätzlich auf `transform` und `opacity`;
- Ziel: flüssiges Scrollen auf einem aktuellen iPhone, nicht nur auf Desktop;
- fällt die gemessene Bildrate wiederholt unter 45 FPS, wird auf statische
  Crossfades ohne Tiefenverschiebung reduziert.

Ein späteres Video muss als WebM und MP4 vorliegen, stumm und `playsinline`
sein, ein Standbild als Fallback besitzen und außerhalb des Viewports nicht
vorab laden. Der erste Prototyp verwendet bewusst kein Video.

## Mobile und Accessibility

- Auf Mobile bleibt die Dokumenthöhe real; kein Touch-Lock und keine
  erzwungene Vollbildrotation.
- `prefers-reduced-motion: reduce` deaktiviert Pinning, Scrubbing, Zoom und
  Parallaxe. Memory Ribbon wechselt über einen statischen Crossfade zu Night
  Cartography.
- Canvas und dekorative Assets sind für Screenreader verborgen; alle Aussagen
  stehen zusätzlich im DOM.
- Fokus, Tab-Reihenfolge und Anchor-Navigation dürfen durch Pinning nicht
  verändert werden.
- Das Early-Access-Formular läuft immer ohne Motion-Abhängigkeit.

## Implementierungsreihenfolge

1. **Zero-Credit-Prototyp:** bestehende Standbilder, GSAP-Timeline,
   Shader-Blend und programmatische Route.
2. **Robustheit:** iPhone, Desktop, Tastatur, Reduced Motion und langsames Gerät
   testen; Performance messen.
3. **Asset-Lücken bestimmen:** erst danach entscheiden, ob Ambient-Loop,
   Übergangsclip oder zusätzliche Tiefenebenen einen sichtbaren Mehrwert haben.
4. **Kostenfreigabe:** Higgsfield-Modell und Kosten kostenlos ermitteln und vor
   jeder kostenpflichtigen Generation ausdrücklich bestätigen lassen.
5. **Finalisierung:** gewählte Assets einbauen, Browsermatrix erneut testen und
   erst danach privat veröffentlichen.

## Akzeptanzkriterien für den Prototyp

- Das erste Bild erscheint ohne Canvas- oder Videowartezeit.
- Scrollen bewegt echten Seiteninhalt und steuert gleichzeitig die Bühne.
- Memory Ribbon geht ohne sichtbaren Sprung in Night Cartography über.
- Route und Wegpunkte bleiben bei Vorwärts- und Rückwärtsscrollen deterministisch.
- iPhone-Scroll bleibt nativ und ohne festhängende Zwischenzustände.
- Reduced Motion zeigt dieselbe Geschichte ohne Zoom, Parallaxe oder Pinning.
- Form, Navigation und Links funktionieren bei deaktiviertem JavaScript-Motion.

## Technische Referenzen

- [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
- [GSAP Standard License](https://gsap.com/community/standard-license/)
- [CSS Scroll-driven Animations](https://developer.chrome.com/docs/css-ui/scroll-driven-animations)
- [MDN: Scroll-driven animation timelines](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations/Timelines)
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- [web.dev: High-performance CSS animations](https://web.dev/articles/animations-guide)
- [web.dev: Video performance](https://web.dev/learn/performance/video-performance)
- [web.dev: prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion)
