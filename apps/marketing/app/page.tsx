import Image from "next/image";
import { MotionStage } from "./MotionStage";
import { JourneyFilm } from "./JourneyFilm";
import { WaitlistForm } from "./WaitlistForm";

export default function Home() {
  return (
    <main>
      <MotionStage />

      <section className="hero" id="start">
        <nav className="nav shell" aria-label="Hauptnavigation">
          <a className="wordmark" href="#start" aria-label="Tripatlas Startseite">
            <span className="wordmark-pin" aria-hidden="true" />
            <span>trip</span><strong>atlas</strong>
          </a>
          <div className="nav-links">
            <a href="#produkt">Produkt</a>
            <a href="#wahlfreiheit">Hosted &amp; Self-hosted</a>
            <a href="#preise">Preise</a>
          </div>
          <a className="nav-cta" href="#early-access">
            Early Access
          </a>
        </nav>

        <div className="hero-grid shell">
          <div className="hero-copy">
            <p className="eyebrow">
              <span aria-hidden="true">✦</span>
              Mehr als Fahrten. Deine Geschichte auf der Straße.
            </p>
            <h1 aria-label="Deine Tesla-Reisen. Automatisch dokumentiert. Unter deiner Kontrolle.">
              Deine Tesla-Reisen.
              <span>Automatisch dokumentiert.</span>
              Unter deiner Kontrolle.
            </h1>
            <p className="hero-lead">
              Plane Roadtrips, finde jede Fahrt wieder und erlebe deine Reisen
              als visuellen Rückblick – auf deinem eigenen Server oder als
              private Instanz in Deutschland.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#early-access">
                Hosted Early Access
                <span aria-hidden="true">→</span>
              </a>
              <a
                className="button button-secondary"
                href="https://github.com/jsc2304/tripatlas"
              >
                Kostenlos selbst hosten
              </a>
            </div>
            <div className="trust-row" aria-label="Produktvorteile">
              <span>Deine Daten</span>
              <i aria-hidden="true" />
              <span>Deine Wahl</span>
              <i aria-hidden="true" />
              <span>Kein Lock-in</span>
            </div>
          </div>

          <aside
            className="journey-caption"
            aria-label="Beispiel einer dokumentierten Reise"
          >
            <p>Journey 01 · Über die Alpen</p>
            <dl>
              <div><dt>Distanz</dt><dd>742 km</dd></div>
              <div><dt>Etappen</dt><dd>7</dd></div>
              <div><dt>Ankunft</dt><dd>17:31</dd></div>
            </dl>
          </aside>
        </div>

        <a className="scroll-cue" href="#journey-film">
          <span aria-hidden="true" />
          Entdecken
        </a>
      </section>

      <JourneyFilm />

      <section className="story-section section" id="produkt">
        <div className="shell">
          <div className="section-heading story-heading reveal">
            <p className="section-kicker">Echte Oberfläche</p>
            <h2>Deine Route. Deine Etappen. Dein Rückblick.</h2>
            <p>
              Keine Konzeptgrafiken: Diese Ansichten stammen aus der laufenden
              Tripatlas-Demo mit synthetischen Fahrdaten aus dem Raum Zürich.
            </p>
          </div>

          <article className="product-proof product-proof-dashboard reveal">
            <div className="product-proof-copy">
              <p className="proof-number">01 · Überblick</p>
              <h3>Was dein Tesla heute wirklich macht.</h3>
              <p>
                Fahrzeugzustand, Park-Drain, letzte Ladung, Wochenleistung und
                die jüngsten Routen stehen in einem ruhigen Überblick – ohne
                dein Auto für einen Datenabruf zu wecken.
              </p>
              <dl className="proof-facts">
                <div><dt>Sync</dt><dd>Read-only aus TeslaMate</dd></div>
                <div><dt>Fokus</dt><dd>Fahrten, Energie, Standzeit</dd></div>
              </dl>
            </div>
            <figure className="app-shot app-shot-wide">
              <figcaption><span>Live-Demo</span><strong>Dashboard · Zürich</strong></figcaption>
              <Image
                src="/product/dashboard.webp"
                width={1265}
                height={712}
                sizes="(max-width: 980px) 100vw, 760px"
                alt="Tripatlas-Dashboard mit Fahrzeugstatus, Wochenwerten und einer Karte der letzten Fahrten in Zürich"
              />
            </figure>
          </article>

          <div className="product-proof-grid">
            <article className="product-proof product-proof-compact reveal">
              <div className="product-proof-copy">
                <p className="proof-number">02 · Vor der Fahrt</p>
                <h3>Roadtrips mit Reserve planen.</h3>
                <p>
                  Mehrere Checkpoints, Start-SoC, Temperatur und deine
                  persönliche Verbrauchskurve ergeben eine nachvollziehbare
                  Prognose bis zur Ankunft.
                </p>
                <ul className="proof-list">
                  <li>Etappen und Ladestopps explizit planen</li>
                  <li>Ankunfts-SoC und Reserve sofort sehen</li>
                  <li>Als Journey speichern und unterwegs öffnen</li>
                </ul>
              </div>
              <figure className="app-shot app-shot-tall">
                <figcaption><span>Live-Demo</span><strong>Roadtrip-Planer</strong></figcaption>
                <Image
                  src="/product/planner.webp"
                  width={1265}
                  height={1451}
                  sizes="(max-width: 980px) 100vw, 570px"
                  alt="Tripatlas-Roadtrip-Planer mit Ziel, violetter Route, Verbrauchsprognose und Ankunfts-SoC"
                />
              </figure>
            </article>

            <article className="product-proof product-proof-compact reveal">
              <div className="product-proof-copy">
                <p className="proof-number">03 · Nach der Fahrt</p>
                <h3>Ein Tag, vollständig nachvollziehbar.</h3>
                <p>
                  Fahrten und Parkphasen bleiben getrennt und ergeben gemeinsam
                  eine Chronik. Danach kannst du klassifizieren, suchen oder als
                  CSV, PDF und GPX exportieren.
                </p>
                <ul className="proof-list">
                  <li>Jede Fahrt mit Start, Ziel, Dauer und Verbrauch</li>
                  <li>Parkphasen und Ladeereignisse dazwischen</li>
                  <li>Privat, geschäftlich oder Arbeitsweg zuordnen</li>
                </ul>
              </div>
              <figure className="app-shot app-shot-tall">
                <figcaption><span>Live-Demo</span><strong>Tageschronik</strong></figcaption>
                <Image
                  src="/product/day.webp"
                  width={1265}
                  height={1169}
                  sizes="(max-width: 980px) 100vw, 570px"
                  alt="Tripatlas-Tageschronik mit vier Fahrten, Parkphasen und Klassifizierungsoptionen"
                />
              </figure>
            </article>
          </div>
        </div>
      </section>

      <section className="bento-section section" id="features">
        <div className="shell bento-grid">
          <article className="bento-card bento-large reveal">
            <figure className="app-shot bento-app-shot">
              <figcaption><span>81 Messpunkte</span><strong>Büro → Zuhause</strong></figcaption>
              <Image
                src="/product/drive.webp"
                width={1265}
                height={1420}
                sizes="(max-width: 980px) 100vw, 620px"
                alt="Tripatlas-Fahrtendetail mit Kennzahlen, Karte und Verlauf von Ladestand und Geschwindigkeit"
              />
            </figure>
            <div>
              <p className="card-kicker">Fahrtendetail</p>
              <h3>Nicht nur Strecke. Auch ihr Kontext.</h3>
              <p>Route, SoC, Tempo, Höhenprofil, Wetter und nachvollziehbar gekennzeichnete Schätzwerte erklären jede einzelne Fahrt.</p>
            </div>
          </article>

          <article className="bento-card reveal">
            <div className="drain-visual" aria-hidden="true">
              <span>49%</span>
              <i><b /></i>
              <small>−1 % seit 7 Stunden</small>
            </div>
            <p className="card-kicker">Parking Drain</p>
            <h3>Sehen, was im Stand passiert.</h3>
            <p>Aktueller und kumulierter Akkuverlust seit der letzten Ladung auf einen Blick.</p>
          </article>

          <article className="bento-card reveal">
            <div className="search-visual" aria-hidden="true">
              <span>⌕</span><p>Lago Maggiore</p>
              <div><i /> 12 Fahrten · 2 Journeys</div>
            </div>
            <p className="card-kicker">Suche &amp; Struktur</p>
            <h3>Jede Strecke wiederfinden.</h3>
            <p>Orte, Tags, Zwecke und Klassifizierungen machen aus Rohdaten ein persönliches Archiv.</p>
          </article>

          <article className="bento-card bento-wide reveal">
            <div>
              <p className="card-kicker">Ehrliche Daten</p>
              <h3>Rohwert oder Schätzung? Du siehst den Unterschied.</h3>
              <p>Tripatlas kennzeichnet abgeleitete Werte und liest im normalen Betrieb nur aus deinem TeslaMate-Archiv.</p>
            </div>
            <div className="data-tags" aria-label="Dateneigenschaften">
              <span>Read-only Sync</span><span>Exportierbar</span><span>Nachvollziehbar</span>
            </div>
          </article>
        </div>
      </section>

      <section className="choice-section section" id="wahlfreiheit">
        <div className="shell">
          <div className="section-heading reveal">
            <p className="section-kicker">Wahlfreiheit</p>
            <h2>Deine Daten. Dein Betriebsmodell.</h2>
            <p>Starte komfortabel oder behalte jeden technischen Hebel selbst in der Hand.</p>
          </div>

          <div className="choice-grid">
            <article className="choice-card choice-hosted reveal">
              <div className="choice-topline"><span>Für die meisten Fahrer</span><i>Early Access</i></div>
              <h3>Hosted in Deutschland</h3>
              <p className="choice-lead">Eine private, betreute Tripatlas-Instanz – ohne Docker, Updates oder Serverpflege.</p>
              <ul>
                <li>Geplante private Instanz pro Kunde</li>
                <li>Hosting auf deutschen Servern</li>
                <li>Backups und Updates inklusive</li>
                <li>Export und Wechsel zu Self-hosted</li>
              </ul>
              <a className="button button-primary" href="#early-access">Early Access vormerken <span>→</span></a>
            </article>

            <article className="choice-card reveal">
              <div className="choice-topline"><span>Für Selbsthoster</span><i>Community</i></div>
              <h3>Self-hosted</h3>
              <p className="choice-lead">Der vollständige Tripatlas-Core unter FSL-1.1-ALv2 auf deinem Server, NAS oder Raspberry Pi.</p>
              <ul>
                <li>Volle Datenhoheit</li>
                <li>Keine laufenden Gebühren</li>
                <li>Fair Source: einsehbar und anpassbar</li>
                <li>Eigene TeslaMate-Installation</li>
              </ul>
              <a className="button button-secondary" href="https://github.com/jsc2304/tripatlas">Auf GitHub ansehen <span>↗</span></a>
            </article>
          </div>
        </div>
      </section>

      <section className="pricing-section section" id="preise">
        <div className="shell pricing-shell">
          <div className="pricing-copy reveal">
            <p className="section-kicker">Einfacher Start</p>
            <h2>Kein Tarifdschungel.</h2>
            <p>Self-hosted bleibt kostenlos. Für Hosted testen wir einen fairen Early-Access-Preis mit den ersten Design-Partnern.</p>
          </div>
          <div className="price-card reveal">
            <span className="price-label">Hosted Early Access</span>
            <div className="price"><strong>9,90 €</strong><span>/ Monat<br />pro Fahrzeug</span></div>
            <p>Geplanter Zielpreis. Abrechnung beginnt erst, wenn deine Instanz bereitsteht.</p>
            <a className="button button-primary" href="#early-access">Unverbindlich vormerken <span>→</span></a>
          </div>
        </div>
      </section>

      <section className="waitlist-section section" id="early-access">
        <div className="shell waitlist-shell">
          <div className="waitlist-copy reveal">
            <p className="section-kicker">Founding Beta</p>
            <h2>Gestalte Hosted Tripatlas mit.</h2>
            <p>Wir suchen die ersten Tesla-Fahrer, die eine private, betreute Instanz testen und mit ihrem Feedback die Hosted-Version mitprägen.</p>
            <div className="founding-note"><span>5–10</span><p>Plätze in der ersten betreuten Beta</p></div>
          </div>
          <WaitlistForm />
        </div>
      </section>

      <section className="faq-section section">
        <div className="shell faq-shell">
          <div className="section-heading reveal">
            <p className="section-kicker">Fragen</p>
            <h2>Was du vor dem Start wissen solltest.</h2>
          </div>
          <div className="faq-list">
            <details className="reveal">
              <summary>Brauche ich TeslaMate?</summary>
              <p>Für Self-hosted ja: Tripatlas liest deine Fahrhistorie aus einer bestehenden TeslaMate-Datenbank. Beim Hosted-Angebot soll die Datenanbindung für dich betreut werden.</p>
            </details>
            <details className="reveal">
              <summary>Weckt Tripatlas mein Fahrzeug auf?</summary>
              <p>Der normale Tripatlas-Sync liest ausschließlich vorhandene TeslaMate-Daten und kontaktiert das Fahrzeug nicht. Nur ausdrücklich ausgelöste Tesla-Funktionen können eine Fahrzeugverbindung verwenden.</p>
            </details>
            <details className="reveal">
              <summary>Wo liegen meine Daten beim Hosted-Angebot?</summary>
              <p>Die Beta ist mit isolierten Kundeninstanzen auf Servern in Deutschland geplant. Konkrete Datenschutz- und Löschprozesse veröffentlichen wir vor dem Start.</p>
            </details>
            <details className="reveal">
              <summary>Kann ich später zu Self-hosted wechseln?</summary>
              <p>Das ist ein Kernversprechen: Deine Daten sollen exportierbar bleiben, damit Hosted keine Einbahnstraße und kein Lock-in wird.</p>
            </details>
            <details className="reveal">
              <summary>Ist Tripatlas ein offizielles Tesla-Produkt?</summary>
              <p>Nein. Tripatlas ist ein unabhängiges Fair-Source-Projekt und nicht mit Tesla, Inc. verbunden oder von Tesla unterstützt.</p>
            </details>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="shell footer-grid">
          <div>
            <a className="wordmark" href="#start"><span className="wordmark-pin" aria-hidden="true" /><span>trip</span><strong>atlas</strong></a>
            <p>Deine Tesla-Reisen. Unter deiner Kontrolle.</p>
          </div>
          <div className="footer-links">
            <a href="#produkt">Produkt</a>
            <a href="#wahlfreiheit">Hosted &amp; Self-hosted</a>
            <a href="https://github.com/jsc2304/tripatlas">GitHub</a>
            <a href="/impressum">Impressum</a>
            <a href="/datenschutz">Datenschutz</a>
          </div>
          <p className="footer-note">Unabhängiges Fair-Source-Projekt · Neue Versionen: FSL-1.1-ALv2 · Frühere Veröffentlichungen: AGPL-3.0</p>
        </div>
      </footer>
    </main>
  );
}
