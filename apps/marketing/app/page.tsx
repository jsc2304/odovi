import { WaitlistForm } from "./WaitlistForm";

const routeStops = [
  { label: "Zürich", detail: "08:42", x: "10%", y: "76%" },
  { label: "Andermatt", detail: "11:18", x: "38%", y: "53%" },
  { label: "Lago Maggiore", detail: "15:06", x: "70%", y: "24%" },
  { label: "Finale", detail: "17:31", x: "90%", y: "36%" },
];

export default function Home() {
  return (
    <main>
      <section className="hero" id="start">
        <div className="hero-glow hero-glow-one" aria-hidden="true" />
        <div className="hero-glow hero-glow-two" aria-hidden="true" />

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
            <h1>
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

          <div className="route-showcase" aria-label="Vorschau eines Tripatlas Journey-Rückblicks">
            <div className="route-meta">
              <div>
                <p>Journey Rückblick</p>
                <h2>Über die Alpen</h2>
              </div>
              <span>742 km</span>
            </div>

            <div className="route-world" aria-hidden="true">
              <div className="terrain terrain-one" />
              <div className="terrain terrain-two" />
              <div className="route-line route-line-one" />
              <div className="route-line route-line-two" />
              <div className="route-line route-line-three" />
              <div className="route-pulse" />
              {routeStops.map((stop, index) => (
                <div
                  className="route-stop"
                  key={stop.label}
                  style={{ left: stop.x, top: stop.y }}
                >
                  <i data-active={index === routeStops.length - 1 ? "true" : undefined} />
                  <span>
                    <strong>{stop.label}</strong>
                    <small>{stop.detail}</small>
                  </span>
                </div>
              ))}
              <div className="north-marker">N</div>
            </div>

            <div className="route-footer">
              <span><strong>7</strong> Etappen</span>
              <span><strong>10 h 24 min</strong> Fahrzeit</span>
              <span><strong>3</strong> Ladestopps</span>
            </div>
          </div>
        </div>

        <a className="scroll-cue" href="#produkt">
          <span aria-hidden="true" />
          Entdecken
        </a>
      </section>

      <section className="story-section section" id="produkt">
        <div className="shell">
          <div className="section-heading reveal">
            <p className="section-kicker">Journey-first</p>
            <h2>Nicht noch ein Fahrzeug-Dashboard.</h2>
            <p>
              Tripatlas macht aus Telemetrie eine nachvollziehbare Geschichte:
              von der einzelnen Fahrt bis zur kompletten Reise.
            </p>
          </div>

          <div className="story-steps">
            <article className="story-step reveal">
              <span>01</span>
              <div className="step-icon route-icon" aria-hidden="true"><i /><i /><i /></div>
              <h3>Planen</h3>
              <p>Roadtrips mit mehreren Etappen, Reichweitenprognose und Ladestopps vorbereiten.</p>
            </article>
            <article className="story-step reveal">
              <span>02</span>
              <div className="step-icon drive-icon" aria-hidden="true"><i /></div>
              <h3>Fahren</h3>
              <p>Fahrten, Stopps, Energie und Park-Drain entstehen automatisch aus deinen Daten.</p>
            </article>
            <article className="story-step reveal">
              <span>03</span>
              <div className="step-icon archive-icon" aria-hidden="true"><i /><i /></div>
              <h3>Wiederfinden</h3>
              <p>Jeden Tag, jeden Ort und jede Strecke durchsuchen, klassifizieren und exportieren.</p>
            </article>
            <article className="story-step reveal">
              <span>04</span>
              <div className="step-icon spark-icon" aria-hidden="true">✦</div>
              <h3>Wiedererleben</h3>
              <p>Tage und Journeys als scroll-gesteuerten, räumlichen Routenrückblick erleben.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="bento-section section">
        <div className="shell bento-grid">
          <article className="bento-card bento-large reveal">
            <div className="mini-day">
              <div className="mini-day-head"><span>Mittwoch, 19. August</span><strong>3 Fahrten</strong></div>
              <div className="mini-timeline">
                <i /><span><strong>Zuhause → Büro</strong><small>08:12 · 18,4 km</small></span>
                <i /><span><strong>Büro → Seeufer</strong><small>16:48 · 27,1 km</small></span>
                <i /><span><strong>Seeufer → Zuhause</strong><small>20:06 · 22,8 km</small></span>
              </div>
            </div>
            <div>
              <p className="card-kicker">Tagesarchiv</p>
              <h3>Dein Tag bleibt nachvollziehbar.</h3>
              <p>Separate Fahrten, Ladestopps und Parkvorgänge in einer klaren Timeline – ohne sie künstlich zusammenzukleben.</p>
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
              <p className="choice-lead">Der komplette freie AGPL-Core auf deinem Server, NAS oder Raspberry Pi.</p>
              <ul>
                <li>Volle Datenhoheit</li>
                <li>Keine laufenden Gebühren</li>
                <li>Offener Quellcode auf GitHub</li>
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
              <p>Nein. Tripatlas ist ein unabhängiges Open-Source-Projekt und nicht mit Tesla, Inc. verbunden oder von Tesla unterstützt.</p>
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
          </div>
          <p className="footer-note">Unabhängiges Open-Source-Projekt · AGPL-3.0</p>
        </div>
      </footer>
    </main>
  );
}
