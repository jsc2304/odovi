# Tripatlas Vision

## 1. Kurzfassung

**Tripatlas ist eine self-hosted Tesla-Fahrtenarchiv- und Journey-Analytics-App.**

Die App bezieht ihre Daten aus einer bestehenden TeslaMate-Installation (read-only; eine direkte Fleet-Telemetry-Anbindung bleibt als spätere Option, siehe §26), rekonstruiert daraus Fahrten, Parkvorgänge und Ladevorgänge und macht diese Daten tagesgenau durchsuchbar. Der wichtigste Kernnutzen ist, dass Nutzer rückblickend exakt nachvollziehen können, **wann sie wohin gefahren sind**, welche Strecke zurückgelegt wurde und ob eine Fahrt privat, geschäftlich, Pendelstrecke oder Teil einer Reise war.

Darauf aufbauend können einzelne Fahrten, Ladestopps und Parkvorgänge über Tags oder Journeys gruppiert werden, zum Beispiel für:

- Geschäftstermine
- Kundenfahrten
- Urlaubsreisen
- Wochenendtrips
- Projekte
- Werkstattbesuche
- Lade- und Verbrauchsanalysen

Tripatlas ist kein allgemeiner Tesla-Remote-Control-Klon. Der Fokus liegt auf **Wiederfinden, Nachweisen, Auswerten und eigener Datenhoheit**.

---

## 2. Produktvision

Tripatlas soll die persönliche Bewegungs- und Energiehistorie eines Tesla-Fahrzeugs verständlich, nachvollziehbar und auswertbar machen.

Die App beantwortet vor allem diese Fragen:

- Wann bin ich an einem bestimmten Tag wohin gefahren?
- Wie viele Kilometer hatte eine bestimmte Fahrt?
- Welche Fahrten waren geschäftlich?
- Welche Fahrten gehören zu einem Termin, Projekt, Kunden oder Urlaub?
- Wie viel Energie habe ich auf einer Reise verbraucht?
- Wie viel Energie wurde während einer Reise geladen?
- Welche Ladestopps gehörten zu einer Reise?
- Wie hoch war der Durchschnittsverbrauch?
- Wie viele Höhenmeter wurden zurückgelegt?
- Wie kann ich diese Daten exportieren und nachweisen?

Die App soll zuerst praktisch und verlässlich sein. Schöne Dashboards sind wertvoll, aber sie dürfen nicht vor dem Kernproblem stehen: **Eine Fahrt muss rückblickend schnell und exakt auffindbar sein.**

---

## 3. Zielgruppe

### Primäre Zielgruppe

Tesla-Fahrer, die ihre Fahrten selbst hosten und auswerten möchten.

Typische Nutzer:

- Selbstständige, die geschäftliche Kilometer einreichen müssen
- Angestellte mit Reisekostenabrechnung
- Nutzer, die Tessie, Wattly, TeslaFi oder ähnliche Apps kennen
- Nutzer, die Abo-Gebühren vermeiden möchten
- Nutzer, die Bewegungsdaten nicht dauerhaft bei einem Drittanbieter speichern wollen
- Roadtrip- und Urlaubsfahrer, die ihre Reisen detailliert analysieren möchten

### Sekundäre Zielgruppe

Technisch interessierte Nutzer mit Self-Hosting-Erfahrung.

Typische Infrastruktur:

- Docker Compose
- eigener Server, NAS oder Home Server
- PostgreSQL
- Reverse Proxy
- gelegentlich vorhandene TeslaMate- oder TeslaLogger-Installation

---

## 4. Kernversprechen

> Ich kann ein Datum auswählen und sehe jede einzelne Fahrt dieses Tages als separaten Eintrag mit Startzeit, Zielzeit, Startort, Zielort, Kilometerstand, Distanz und Klassifizierung.

Dieses Versprechen ist wichtiger als jedes Dashboard.

Beispiel:

```text
02.02.2026

08:14 - 08:47
Zuhause → Kunde Müller
27,3 km
Geschäftlich

10:22 - 10:39
Kunde Müller → Büro
12,8 km
Geschäftlich

17:04 - 17:36
Büro → Zuhause
24,1 km
Privat
```

Der Nutzer soll in wenigen Sekunden eine Fahrt finden, klassifizieren, mit Zweck oder Kunde versehen und exportieren können.

---

## 5. Produktprinzipien

### 5.1 Tagesgenau vor dashboardlastig

Die wichtigste Ansicht ist nicht das globale Dashboard, sondern die Tagesansicht.

Nutzer sollen nicht durch Diagramme klicken müssen, um eine konkrete Fahrt zu finden. Die App muss zuerst ein präzises Fahrtenarchiv sein.

### 5.2 Parken trennt Fahrten

Eine Fahrt beginnt, wenn das Fahrzeug losfährt, und endet, wenn das Fahrzeug parkt.

Standardregel:

```text
Parkvorgang = Fahrtende
```

Dadurch entstehen atomare Fahrten, die für Nachweise und Abrechnungen brauchbar sind.

Beispiel:

```text
Zuhause → Kunde
Kunde → Büro
Büro → Zuhause
```

Diese Fahrten dürfen nicht automatisch zu einer großen Tagesfahrt zusammengeklebt werden.

### 5.3 Atomare Daten zuerst, Gruppierung danach

Die App unterscheidet klar zwischen:

- einzelner Fahrt
- Parkvorgang
- Ladevorgang
- Tagesansicht
- Tag
- Journey
- Report

Eine Journey ist eine Gruppierung. Sie darf die darunterliegenden Einzelfahrten nicht ersetzen.

### 5.4 Self-hosted und datenportabel

Tripatlas soll lokal oder auf eigener Infrastruktur laufen.

Zusätzlich kann Tripatlas als betreute Hosted-Instanz angeboten werden, um die
Einstiegshürde für Nutzer ohne Docker-, Server- oder TeslaMate-Erfahrung zu
senken. Der Self-hosted-Core bleibt dabei vollständig nutzbar und kostenlos.
Hosted darf keinen Lock-in erzeugen: Exporte und ein späterer Wechsel auf die
eigene Infrastruktur bleiben Teil des Produktversprechens.

Die Daten gehören dem Nutzer. Deshalb müssen Exporte und Backups ein Kernfeature sein.

Pflichtformate:

- CSV
- JSON
- PDF
- optional GPX

### 5.5 Keine unnötigen Tesla-Wakes

Die App soll API- und batterieschonend arbeiten.

Ziel ist eine Telemetry-first-Architektur mit möglichst wenig Polling und möglichst wenigen aktiven Wake-Vorgängen.

### 5.6 Nachvollziehbarkeit statt Magie

Automatische Klassifizierungen, Ortsnamen, Tags und Journey-Zuordnungen sind hilfreich, müssen aber nachvollziehbar und korrigierbar sein.

Wichtige Änderungen sollen protokolliert werden.

---

## 6. Kernobjekte

### 6.1 Drive

Eine **Drive** ist eine einzelne Fahrt zwischen zwei Parkvorgängen.

Beispiele:

- Zuhause → Kunde
- Kunde → Büro
- Büro → Zuhause
- Hotel → Ausflugsziel

Eine Drive enthält mindestens:

- Startzeit
- Endzeit
- Startort
- Zielort
- Start-Kilometerstand
- End-Kilometerstand
- Distanz
- Dauer
- Start-SoC
- End-SoC
- verbrauchte Energie
- Durchschnittsverbrauch
- Klassifizierung
- Tags
- Zweck
- Notizen

### 6.2 Park Session

Eine **Park Session** beschreibt einen Stillstand zwischen zwei Fahrten.

Sie enthält:

- Startzeit
- Endzeit
- Standort
- Adresse oder Place
- Dauer

Park Sessions helfen, einen Tag als Timeline zu rekonstruieren.

### 6.3 Charge Session

Eine **Charge Session** beschreibt einen Ladevorgang.

Sie enthält:

- Startzeit
- Endzeit
- Standort
- Start-SoC
- End-SoC
- hinzugefügte Energie
- Ladeleistung
- Ladeart
- Ladezeit
- Kosten
- Tags
- Notizen

### 6.4 Day Timeline

Eine **Day Timeline** zeigt alle relevanten Ereignisse eines Tages in chronologischer Reihenfolge:

- Parken
- Fahren
- Laden
- Stopps

Beispiel:

```text
02.02.2026

07:58 - 08:14
Geparkt: Zuhause

08:14 - 08:47
Fahrt: Zuhause → Kunde Müller
27,3 km · 33 min · 162 Wh/km

08:47 - 10:22
Geparkt: Kunde Müller
1 h 35 min

10:22 - 10:39
Fahrt: Kunde Müller → Büro
12,8 km · 17 min · 148 Wh/km
```

### 6.5 Tag

Ein **Tag** ist eine flexible Markierung.

Beispiele:

- Urlaub Italien 2026
- Kunde Müller
- Projekt X
- Werkstatt
- Familie
- Konferenz
- Flughafen

Tags können auf mehrere Objekte angewendet werden:

- Drives
- Charge Sessions
- Park Sessions
- Journeys

### 6.6 Journey

Eine **Journey** ist eine Sammlung aus Fahrten, Ladestopps und optional Parkvorgängen.

Beispiele:

- Urlaub Südtirol 2026
- Geschäftsreise Hamburg
- Wochenendtrip Nordsee
- Projektphase Kunde Müller

Eine Journey kann automatisch über Zeitraumregeln oder manuell zusammengestellt werden.

Beispiel:

```text
Journey: Urlaub Südtirol 2026
Zeitraum: 03.08.2026 07:00 bis 18.08.2026 22:00

Enthält:
- Fahrt Zuhause → München
- Ladestopp Supercharger
- Fahrt München → Brenner
- Ladestopp Brenner
- Fahrt Brenner → Hotel
- Tagesausflüge
- Rückreise
```

### 6.7 Place

Ein **Place** ist ein benannter Ort mit Koordinate und Radius.

Beispiele:

- Zuhause
- Büro
- Kunde Müller
- Hotel
- Supercharger
- Werkstatt

Places machen die Tagesansicht lesbar.

Statt:

```text
48.137154, 11.576124 → 48.148221, 11.558882
```

soll die App anzeigen:

```text
Zuhause → Kunde Müller
```

---

## 7. Hauptnavigation

Die App sollte um den echten Nutzungsablauf herum aufgebaut sein.

```text
Fahrten
├─ Tagesansicht
├─ Kalender
├─ Suche
├─ Tags
├─ Exporte

Reisen
├─ Übersicht
├─ Urlaube
├─ Geschäftsreisen
├─ Roadtrips

Laden
├─ Sessions
├─ Kosten
├─ Energie

Orte
├─ Zuhause
├─ Büro
├─ Kunden
├─ Favoriten

Reports
├─ Monat
├─ Jahr
├─ Geschäftlich
├─ Privat
├─ Tags
```

Die Fahrtenansicht ist der wichtigste Einstiegspunkt.

---

## 8. Haupt-Use-Cases

### 8.1 Geschäftliche Fahrt nachträglich finden

Der Nutzer hatte an einem bestimmten Datum einen Geschäftstermin und muss Kilometer einreichen.

Ablauf:

1. Nutzer öffnet **Fahrten**
2. Nutzer wählt Datum, zum Beispiel `02.02.2026`
3. App zeigt alle Fahrten dieses Tages
4. Nutzer erkennt die Fahrt anhand von Startort, Zielort, Uhrzeit und Distanz
5. Nutzer markiert die Fahrt als geschäftlich
6. Nutzer ergänzt Zweck, Kunde oder Projekt
7. Nutzer exportiert die Fahrt als PDF oder CSV

Ergebnis:

```text
Datum: 02.02.2026
Start: Zuhause
Ziel: Kunde Müller
Startzeit: 08:14
Endzeit: 08:47
Distanz: 27,3 km
Zweck: Kundentermin
Klassifizierung: Geschäftlich
```

### 8.2 Urlaubsreise analysieren

Der Nutzer möchte eine Reise taggen und später auswerten.

Ablauf:

1. Nutzer erstellt Journey `Urlaub Südtirol 2026`
2. Nutzer definiert Zeitraum
3. App ordnet Fahrten und Ladestopps automatisch zu
4. Nutzer korrigiert einzelne Zuordnungen bei Bedarf
5. App berechnet Reise-Kennzahlen

Kennzahlen:

- Gesamtkilometer
- Durchschnittsverbrauch
- verbrauchte Energie
- geladene Energie
- Anzahl Ladestopps
- Ladezeit
- Kosten
- Höhenmeter bergauf
- Höhenmeter bergab
- SoC-Verlauf
- Verbrauch pro Etappe

### 8.3 Suche nach Ort oder Kunde

Der Nutzer möchte wissen, wann er bei einem bestimmten Kunden war.

Ablauf:

1. Nutzer öffnet Suche
2. Nutzer sucht nach `Kunde Müller`
3. App zeigt alle Fahrten mit Start oder Ziel bei diesem Place
4. Nutzer filtert optional nach Zeitraum oder Klassifizierung

### 8.4 Monatsreport für geschäftliche Fahrten

Der Nutzer möchte alle geschäftlichen Fahrten eines Monats exportieren.

Ablauf:

1. Nutzer öffnet Reports
2. Nutzer wählt Monat
3. Nutzer filtert auf `Geschäftlich`
4. App zeigt Summe der Kilometer und alle Einzelfahrten
5. Nutzer exportiert CSV oder PDF

---

## 9. MVP

### 9.1 MVP-Ziel

Der MVP muss den Tessie-Kernnutzen zuverlässig nachbilden:

> Datum auswählen, Fahrten sehen, Fahrt erkennen, Kilometer nachweisen, Fahrt klassifizieren und exportieren.

Alles andere ist nachrangig.

### 9.2 MVP-Funktionen

#### Tesla-Anbindung

- Tesla OAuth
- Fahrzeug verbinden
- Fahrzeugliste anzeigen
- Daten erfassen

#### Fahrterkennung

- Fahrten automatisch erkennen
- Parkvorgang trennt Fahrt
- Start- und End-Kilometerstand speichern
- Start- und Zielposition speichern
- Distanz berechnen
- Dauer berechnen

#### Tagesansicht

- Datumsauswahl
- Liste aller Fahrten eines Tages
- Startzeit und Endzeit
- Startort und Zielort
- Kilometer
- Dauer
- Klassifizierung
- Tags
- Detailansicht pro Fahrt

#### Klassifizierung

- Privat
- Geschäftlich
- Arbeitsweg
- Unklassifiziert

#### Nachbearbeitung

- Zweck
- Kunde
- Projekt
- Notiz
- Tags
- manuelle Korrektur von Start/Ziel-Place
- manuelles Zusammenführen oder Splitten später möglich

#### Export

- Einzelfahrt als CSV
- Einzelfahrt als PDF
- Tagesexport
- Monatsreport für geschäftliche Fahrten

#### Orte

- Places anlegen
- Geofence-Radius
- automatische Benennung von Start- und Zielort

---

## 10. MVP-Nichtziele

Folgende Funktionen sind bewusst nicht Teil des ersten MVP:

- Tesla Remote Controls
- Klimasteuerung
- Türsteuerung
- Hupen, Blinken, Fahrzeugbefehle
- Social Features
- Community
- Battery Health
- native iOS- oder Android-App
- komplexe Automationen
- vollständiger Tessie-Klon
- vollständiger Wattly-Klon
- Flottenmanagement
- Live-Tracking für andere Personen

Diese Funktionen können später ergänzt werden, dürfen aber nicht vom Kernnutzen ablenken.

---

## 11. Phase 2: Journey Analytics

Nach dem Fahrtenarchiv kommt die Reiseanalyse.

### Funktionen

- Journey anlegen
- Zeitraum definieren
- Fahrten automatisch zuordnen
- Ladestopps automatisch zuordnen
- manuelle Zuordnung von Fahrten und Ladestopps
- Journey-Tags
- Reise-Dashboard
- Export einer Journey

### Kennzahlen

- Gesamtdistanz
- Fahrzeit
- Parkzeit
- Ladezeit
- Anzahl Ladestopps
- Durchschnittsverbrauch
- verbrauchte Energie
- hinzugefügte Energie
- Start-SoC
- End-SoC
- Minimum-SoC
- Maximum-SoC
- Kosten
- Kosten pro 100 km

---

## 12. Phase 3: Höhenmeter und Karten

### Funktionen

- Route speichern
- Route vereinfachen
- Karte pro Fahrt
- Karte pro Journey
- Ladestopps als Marker
- Höhenprofil
- Höhenmeter bergauf
- Höhenmeter bergab
- Verbrauch entlang der Route
- SoC-Verlauf entlang der Route

### Höhenmeter-Prinzip

Tesla liefert für den Kernuse-case vor allem Standortdaten. Höhenmeter sollten deshalb aus GPS-Daten und einer Elevation-Datenquelle berechnet werden.

Berechnungsprinzip:

```text
1. GPS-Track glätten
2. Trackpunkte sinnvoll reduzieren
3. Höhenwerte ergänzen
4. Höhenprofil glätten
5. kleine Ausreißer ignorieren
6. positive Differenzen summieren
7. negative Differenzen summieren
```

Höhenmeter sollen in der UI als berechnete Werte gekennzeichnet werden.

---

## 13. Phase 4: Komfort und Automatisierung

### Funktionen

- automatische Tag-Regeln
- Kalenderintegration
- Kundenerkennung
- Projektregeln
- regelmäßige Reports
- Import aus TeslaMate
- Import aus TeslaLogger
- Import aus CSV
- API für eigene Auswertungen
- Webhooks
- Home Assistant Integration

Beispiele für Regeln:

```text
Wenn Ziel im Radius von Kunde Müller
→ Tag: Kunde Müller
→ Klassifizierungsvorschlag: Geschäftlich
```

```text
Wenn Fahrt innerhalb Journey-Zeitraum
→ Journey automatisch zuordnen
```

```text
Wenn Start Zuhause und Ziel Büro
→ Klassifizierungsvorschlag: Arbeitsweg
```

---

## 14. Datenmodell-Entwurf

### 14.1 vehicles

```text
vehicles
- id
- tesla_vehicle_id
- vin_hash
- display_name
- created_at
- updated_at
```

### 14.2 drives

```text
drives
- id
- vehicle_id
- start_time
- end_time
- start_odometer_km
- end_odometer_km
- distance_km
- start_lat
- start_lon
- end_lat
- end_lon
- start_place_id
- end_place_id
- start_address
- end_address
- duration_seconds
- start_soc
- end_soc
- consumed_energy_kwh
- avg_consumption_wh_km
- classification
- purpose
- customer
- project
- notes
- created_at
- updated_at
```

### 14.3 park_sessions

```text
park_sessions
- id
- vehicle_id
- start_time
- end_time
- lat
- lon
- place_id
- address
- duration_seconds
- created_at
- updated_at
```

### 14.4 charge_sessions

```text
charge_sessions
- id
- vehicle_id
- start_time
- end_time
- lat
- lon
- place_id
- address
- start_soc
- end_soc
- energy_added_battery_kwh
- energy_added_ac_kwh
- energy_used_grid_kwh
- max_power_kw
- avg_power_kw
- charger_type
- cost
- currency
- notes
- created_at
- updated_at
```

### 14.5 places

```text
places
- id
- name
- type
- lat
- lon
- radius_m
- address
- created_at
- updated_at
```

### 14.6 tags

```text
tags
- id
- name
- color
- category
- created_at
- updated_at
```

### 14.7 drive_tags

```text
drive_tags
- drive_id
- tag_id
```

### 14.8 charge_session_tags

```text
charge_session_tags
- charge_session_id
- tag_id
```

### 14.9 journeys

```text
journeys
- id
- name
- type
- start_time
- end_time
- color
- description
- created_at
- updated_at
```

### 14.10 journey_items

```text
journey_items
- id
- journey_id
- item_type
- item_id
- sort_order
- created_at
- updated_at
```

### 14.11 route_points

```text
route_points
- id
- drive_id
- timestamp
- latitude
- longitude
- elevation_m
- speed_kmh
- odometer_km
- soc
- lifetime_energy_used_kwh
- created_at
```

### 14.12 audit_log

```text
audit_log
- id
- entity_type
- entity_id
- field
- old_value
- new_value
- changed_at
- changed_by
```

---

## 15. Kernmetriken

### 15.1 Distanz

Primäre Berechnung:

```text
distance_km = end_odometer_km - start_odometer_km
```

GPS-Distanzen können zusätzlich angezeigt oder zur Plausibilisierung verwendet werden, sollten aber nicht die primäre Kilometerquelle für Abrechnung und Reports sein.

### 15.2 Durchschnittsverbrauch

```text
avg_consumption_wh_km = consumed_energy_kwh * 1000 / distance_km
```

### 15.3 Verbrauchte Energie

Primär über Energiezähler-Differenz, sofern zuverlässig verfügbar:

```text
consumed_energy_kwh =
  lifetime_energy_used_at_end
  -
  lifetime_energy_used_at_start
```

Fallback:

```text
estimated_energy_used_kwh =
  estimated_usable_battery_capacity_kwh * (start_soc - end_soc) / 100
```

Fallback-Werte müssen als Schätzung gekennzeichnet werden.

### 15.4 Geladene Energie

Für Charge Sessions:

```text
energy_added_battery_kwh = end_charge_energy_added - start_charge_energy_added
```

Optional zusätzlich:

```text
energy_added_ac_kwh
energy_used_grid_kwh
```

Die App sollte klar unterscheiden zwischen:

- Energie im Akku
- Energie vom Ladegerät
- Energie aus dem Stromnetz
- Kosten

### 15.5 Journey-Verbrauch

```text
journey_avg_consumption_wh_km =
  sum(consumed_energy_kwh) * 1000 / sum(distance_km)
```

### 15.6 Höhenmeter

```text
elevation_gain_m = sum(positive_elevation_deltas_above_threshold)
elevation_loss_m = sum(negative_elevation_deltas_above_threshold)
```

Kleine Schwankungen sollen ignoriert werden, um GPS- und Elevation-Rauschen nicht als Höhenmeter zu zählen.

---

## 16. UX-Anforderungen

### 16.1 Fahrtenliste

Die Fahrtenliste muss schnell lesbar sein.

Pflichtspalten:

- Zeit
- Distanz
- Start → Ziel
- Dauer
- Verbrauch
- Klassifizierung
- Tags

Beispiel:

```text
08:14 - 08:47 | 27,3 km | Zuhause → Kunde Müller | Geschäftlich
10:22 - 10:39 | 12,8 km | Kunde Müller → Büro    | Geschäftlich
17:04 - 17:36 | 24,1 km | Büro → Zuhause          | Privat
```

### 16.2 Fahrt-Detailseite

Pflichtinhalte:

- Datum
- Startzeit
- Endzeit
- Startort
- Zielort
- Start-Kilometerstand
- End-Kilometerstand
- Distanz
- Dauer
- Karte
- Klassifizierung
- Zweck
- Kunde
- Projekt
- Tags
- Notizen
- Export

### 16.3 Tages-Timeline

Die Tages-Timeline soll den Tag rekonstruieren.

Sie kombiniert:

- Park Sessions
- Drives
- Charge Sessions

### 16.4 Mobile-first Web-App

Der MVP sollte als responsive Web-App funktionieren.

Native Apps sind optional und nachrangig.

---

## 17. Differenzierung gegenüber Wettbewerbern

### 17.1 Gegenüber Tessie

Tessie ist ein sehr starker Allrounder mit Drive Tracking, Charge Tracking, Exporten, Tags, Automationen und Apps.

Tripatlas differenziert sich durch:

- Self-hosting
- lokale Datenhoheit
- offene Datenstruktur
- Journey-first-Datenmodell
- starke Nachvollziehbarkeit
- Export ohne Anbieterbindung

### 17.2 Gegenüber Wattly

Wattly ist eine moderne Tesla-Companion-App mit starker Apple-UX, Trip Analytics, Charging Analytics, Roadtrip-Features und Battery Health.

Tripatlas differenziert sich durch:

- Self-hosting statt Cloud
- Web-first statt Apple-first
- eigenes Journey- und Tagging-Modell
- offene Exporte
- Fokus auf tagesgenaues Fahrtenarchiv

### 17.3 Gegenüber TeslaMate

TeslaMate ist ein starker self-hosted Logger mit PostgreSQL und Grafana.

Tripatlas differenziert sich durch:

- produktorientierte UX
- Tagesansicht
- Tagging-Workflow
- Journey-Analytics
- Business-Export
- weniger Dashboard-lastige Bedienung

Eine mögliche Strategie ist, Tripatlas anfangs als Layer über TeslaMate-Daten zu bauen.

### 17.4 Gegenüber TeslaLogger

TeslaLogger ist ein technischer self-hosted Logger mit vielen Auswertungen.

Tripatlas differenziert sich durch:

- moderne Web-UX
- klare Fahrten- und Journey-Workflows
- bessere Nutzbarkeit für konkrete Nachweise
- fokussiertes Datenmodell

---

## 18. Technische Architektur

### 18.1 Zielarchitektur

```text
Tesla Fleet API / Fleet Telemetry
        ↓
Ingestion Service
        ↓
Raw Telemetry Store
        ↓
Drive / Charge / Park Processor
        ↓
Application Database
        ↓
Web App
        ↓
Exports / Reports
```

### 18.2 Empfohlener Stack

```text
Frontend:
- Next.js oder ähnliche Web-App

Backend:
- FastAPI, NestJS oder Go

Datenbank:
- PostgreSQL
- optional TimescaleDB für Telemetriedaten

Queue:
- Redis / BullMQ / RabbitMQ

Deployment:
- Docker Compose

Reverse Proxy:
- Caddy oder Traefik

Maps:
- OpenStreetMap
- MapLibre

Elevation:
- Open-Elevation, OpenTopoData oder Open-Meteo Elevation API
```

### 18.3 Telemetry-first

Die App sollte bevorzugt mit Telemetriedaten arbeiten und Polling nur sparsam einsetzen.

Ziele:

- wenig Battery Drain
- niedrige API-Kosten
- wenige Wake-Vorgänge
- robuste Erfassung während Fahrten und Ladevorgängen

### 18.4 Raw Data und berechnete Daten trennen

Rohdaten sollten getrennt von berechneten Fahrten gespeichert werden.

Vorteil:

- Fahrten können neu berechnet werden
- Fehler in der Logik können nachträglich korrigiert werden
- neue Kennzahlen können später ergänzt werden

---

## 19. Datenschutz und Sicherheit

### 19.1 Sensible Daten

Die App verarbeitet hochsensible Bewegungsdaten.

Sensible Daten:

- Standorte
- Routen
- Kundenbesuche
- Wohnort
- Arbeitsort
- Ladeorte
- Bewegungsmuster
- Tesla Tokens

### 19.2 Sicherheitsanforderungen

- Tesla Tokens verschlüsselt speichern
- Access Tokens kurzlebig behandeln
- Refresh Tokens besonders schützen
- HTTPS erzwingen
- lokale Backups verschlüsseln
- Zugriff auf Admin-Nutzer begrenzen
- optionale Zwei-Faktor-Authentifizierung
- Datenexport und Datenlöschung unterstützen

### 19.3 Privacy-Prinzip

Default:

```text
Keine unnötige Weitergabe an Drittanbieter.
Keine Werbung.
Kein Tracking.
Keine fremde Cloud-Pflicht.
```

---

## 20. Export-Anforderungen

### 20.1 Einzelfahrt-Export

Pflichtfelder:

- Datum
- Startzeit
- Endzeit
- Startort
- Zielort
- Start-Kilometerstand
- End-Kilometerstand
- Distanz
- Klassifizierung
- Zweck
- Kunde
- Projekt
- Notizen

### 20.2 Tagesexport

Enthält alle Fahrten eines Tages.

### 20.3 Monatsreport

Enthält gruppierte Fahrten nach Klassifizierung.

Kennzahlen:

- private Kilometer
- geschäftliche Kilometer
- Arbeitsweg-Kilometer
- Gesamtkilometer
- Anzahl Fahrten

### 20.4 Journey-Export

Enthält:

- alle Drives
- alle Charge Sessions
- Gesamtkilometer
- Verbrauch
- geladene Energie
- Ladestopps
- Kosten
- Höhenmeter
- Route optional als GPX

---

## 21. Success Metrics

### 21.1 Produktmetriken

- Nutzer findet eine Fahrt an einem bestimmten Datum in unter 10 Sekunden
- Nutzer kann eine Fahrt in unter 30 Sekunden klassifizieren und exportieren
- mindestens 95 Prozent der Fahrten werden korrekt segmentiert
- Parkvorgänge trennen Fahrten zuverlässig
- Start- und Ziel-Places werden zuverlässig erkannt
- Monatsreport ist ohne manuelle Nacharbeit nutzbar

### 21.2 Technische Metriken

- keine unnötigen Wake-Vorgänge im Normalbetrieb
- Telemetry-Verarbeitung läuft stabil
- Fahrten werden auch bei kurzen Datenlücken korrekt rekonstruiert
- Datenbank bleibt bei langer Nutzung performant
- Export funktioniert reproduzierbar
- Backups sind automatisierbar

---

## 22. Offene Fragen

### Tesla API

- Welche Fleet Telemetry Signale sind für alle Ziel-Fahrzeuge zuverlässig verfügbar?
- Welche Signale sind nur mit bestimmten Firmware-Versionen verfügbar?
- Wie hoch sind die realen API-Kosten bei einem Fahrzeug?
- Welche Polling-Fallbacks sind nötig?

### Fahrterkennung

- Wie lang muss ein Parkvorgang sein, um eine Fahrt sicher zu beenden?
- Soll `Park` sofort Fahrtende bedeuten oder erst nach einer kurzen Wartezeit?
- Wie werden kurze Rangierbewegungen behandelt?
- Wie werden Tiefgaragen und GPS-Aussetzer behandelt?

### Energie

- Welche Energiezähler sind für Verbrauch pro Fahrt zuverlässig genug?
- Wie werden Rekuperation und Akkuverluste dargestellt?
- Soll die App zwischen Akku-Energie und Netz-Energie unterscheiden?

### Höhenmeter

- Welche Elevation-Quelle wird verwendet?
- Wird Elevation selbst gehostet oder extern abgefragt?
- Wie stark wird der Track geglättet?

### Rechtliches und Nachweisbarkeit

- Wie streng muss das Audit Log sein?
- Welche Exportformate sind für Reisekosten ausreichend?
- Soll die App ein steuerlich belastbares Fahrtenbuch anstreben oder nur eine praktische Abrechnungshilfe sein?

---

## 23. Roadmap

> **Stand 08.07.2026:** Phase 1–4 sind komplett umgesetzt und laufen produktiv
> (plus Start-Dashboard, Insights, Standzeit-Analytics, Ladekurven,
> Update-/TPMS-Anzeige, Tessie-Import, Auto-Regeln, Bulk-Bearbeitung,
> automatische Ladekosten, Journey-Exporte, i18n, Dark Mode und PWA).
> Phase 5 ist teilweise erledigt (Tessie-Import ✓, TeslaMate ist ohnehin die
> Datenbasis), Rest offen. Phase 6 ist als experimenteller Routenplaner-MVP
> vorhanden; Ausbau zu echter Roadtrip-Planung bleibt Roadmap.

### Phase 1: Fahrtenarchiv ✅

Ziel: Datum auswählen und Fahrten exakt sehen.

- Tesla verbinden
- Fahrten erkennen
- Parkvorgänge erkennen
- Tagesansicht
- Orte benennen
- Fahrt-Detailseite
- Klassifizierung
- Einzelfahrt-Export

### Phase 2: Business Workflows ✅ (Bulk-Bearbeitung offen)

Ziel: geschäftliche Fahrten sauber nachweisen.

- Kunden und Projekte
- Zwecke
- Monatsreport
- CSV/PDF Export
- Audit Log
- Bulk-Bearbeitung
- Suche nach Ort/Kunde

### Phase 3: Journey Analytics ✅ (Journey-Export offen)

Ziel: Urlaube, Reisen und Projekte auswerten.

- Journeys
- Zeitraum-Zuordnung
- Tagging über Drives und Charge Sessions
- Reise-Dashboard
- Ladestopp-Auswertung
- Energieverbrauch pro Journey

### Phase 4: Karten und Höhenmeter ✅ (Karte pro Journey, GPX offen)

Ziel: visuelle Reiseanalyse.

- Route pro Fahrt
- Route pro Journey
- Höhenprofil
- Höhenmeter
- SoC-Verlauf
- Verbrauch entlang der Route
- GPX Export

### Phase 5: Integrationen — teilweise (Tessie-Import ✓)

Ziel: bessere Automatisierung und Datenportabilität.

- TeslaMate Import
- TeslaLogger Import
- Kalenderintegration
- Home Assistant
- API
- Webhooks

### Phase 6: Routenplanung (ABRP-inspiriert) — offen

Ziel: Fahrten vorausplanen mit echten Fahrzeugdaten statt Schätzwerten.

- Route planen mit Ladestopp-Vorschlägen
- aktueller SoC des verbundenen Fahrzeugs als Startwert
- realer Durchschnittsverbrauch aus der eigenen Fahrhistorie (statt generischer Modellwerte)
- Verbrauchsprognose entlang der Route (Höhenprofil aus Phase 4 nutzen)
- Ankunfts-SoC pro Etappe und Ladestopp
- geplante Route mit tatsächlicher Fahrt vergleichen (Plan vs. Ist)

Motivation: A Better Route Planner ist kostenpflichtig geworden; die wertvollsten ABRP-Features (SoC-Anbindung, echter Verbrauch) lassen sich mit den in Tripatlas ohnehin vorhandenen Daten nachbauen.

---

## 24. Nicht verhandelbarer MVP-Satz

> Tripatlas muss es ermöglichen, ein Datum auszuwählen und jede einzelne Fahrt dieses Tages als separaten, nachvollziehbaren Eintrag mit Start, Ziel, Uhrzeit, Kilometerstand, Distanz und Klassifizierung zu sehen.

Wenn dieses Feature nicht hervorragend funktioniert, ist der Rest des Produkts zweitrangig.

---

## 25. Name

Entschieden am 04.07.2026: **Tripatlas** (vorher Arbeitstitel „RangeAtlas").

Begründung: Fokus auf Fahrten/Reisen statt Reichweite — ehrlicher zum Produktkern (Fahrtenarchiv + Journeys). Der Ordnername `range-atlas` bleibt vorerst bestehen.

---

## 26. Entscheidungs-Log

Getroffen am 04.07.2026 (MVP-Planung):

| Thema | Entscheidung |
|---|---|
| Datenquelle MVP | TeslaMate als Ingestion-Layer; Tripatlas liest dessen PostgreSQL read-only und synct in eigene DB. Eigene Fleet-Telemetry-Ingestion später — Datenmodell ist quellen-agnostisch (`source`/`source_id` überall). |
| Stack | TypeScript-Monorepo (pnpm): Next.js + Node-Worker, Drizzle ORM, PostgreSQL, Docker Compose. Kein Redis/Queue im MVP. |
| Scope | 1 Nutzer (einfaches Passwort-Login), Datenmodell multi-vehicle-ready, kein Multi-Tenant. |
| Deployment | Home Server (Raspberry Pi, ARM64), nur LAN/VPN via Tailscale — kein öffentlicher Endpoint. |
| Betriebsmodelle (22.08.2026) | Freier AGPL-Core für Self-hosting plus Validierung einer privaten, betreuten Hosted-Variante. Hosted ist eine zusätzliche Komfortoption und ersetzt weder Datenportabilität noch den Self-hosted-Core. |
| Vermarktung (22.08.2026) | Journey-first: Planung, automatische Dokumentation, Wiederfinden und visueller Rückblick als emotionale Differenzierung; Nachweis- und Fahrtenbuchnutzen als rationaler Zahlungsanlass. |
| Energie | Verbrauch/Fahrt als Schätzung (Rated-Range-Delta × Effizienz, wie TeslaMate); überall als „geschätzt" gekennzeichnet. |
| Trackdaten | `route_points` ab Tag 1 downsampled (~1 Punkt/15 s) aus TeslaMate kopieren — Versicherung + Basis für Phase 4. |
| UI-Sprache | Nur Deutsch im MVP, kein i18n-Framework. |
