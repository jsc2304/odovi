import type { Metadata } from "next";
import Link from "next/link";
import {
  LEGAL_VALUE_MISSING,
  legalContact,
  legalContactIsComplete,
} from "../legal-config";

export const metadata: Metadata = {
  title: "Impressum — Tripatlas",
  description: "Anbieterkennzeichnung für die Tripatlas-Website.",
};

export default function ImpressumPage() {
  return (
    <main className="legal-page">
      <nav className="legal-nav shell" aria-label="Seitennavigation">
        <Link className="wordmark" href="/" aria-label="Tripatlas Startseite">
          <span className="wordmark-pin" aria-hidden="true" />
          <span>trip</span><strong>atlas</strong>
        </Link>
        <Link href="/">Zur Startseite</Link>
      </nav>

      <article className="legal-card shell">
        {!legalContactIsComplete && (
          <aside className="legal-draft-note" role="note">
            Private Vorschau: Anschrift und Kontakt-E-Mail fehlen noch. Diese
            Seite ist so nicht für einen öffentlichen Launch freigegeben.
          </aside>
        )}

        <p className="section-kicker">Rechtliche Angaben</p>
        <h1>Impressum</h1>
        <p className="legal-updated">Stand: 22. August 2026</p>

        <section>
          <h2>Angaben gemäß § 5 DDG</h2>
          <address>
            <strong>{legalContact.providerName}</strong><br />
            {legalContact.streetAddress || LEGAL_VALUE_MISSING}<br />
            {legalContact.postalCodeAndCity || LEGAL_VALUE_MISSING}
          </address>
        </section>

        <section>
          <h2>Kontakt</h2>
          {legalContact.email ? (
            <p><a href={`mailto:${legalContact.email}`}>{legalContact.email}</a></p>
          ) : (
            <p>{LEGAL_VALUE_MISSING}</p>
          )}
        </section>

        <section>
          <h2>Projekt- und Markenhinweis</h2>
          <p>
            Tripatlas ist ein unabhängiges Projekt. Es ist weder mit Tesla,
            Inc. noch mit TeslaMate verbunden und wird von diesen nicht
            unterstützt oder zertifiziert. Genannte Marken gehören ihren
            jeweiligen Inhabern.
          </p>
        </section>

        <section>
          <h2>Software, Inhalte und Marke</h2>
          <p>
            Für den Tripatlas-Core, die Marketingseite und die Marke gelten
            unterschiedliche Bedingungen. Maßgeblich sind die Hinweise im
            <a href="https://github.com/jsc2304/tripatlas/blob/main/LICENSING.md"> Lizenzüberblick</a>
            {" "}und in der
            <a href="https://github.com/jsc2304/tripatlas/blob/main/TRADEMARKS.md"> Markenrichtlinie</a>.
          </p>
        </section>
      </article>

      <footer className="legal-footer shell">
        <Link href="/">Startseite</Link>
        <Link href="/datenschutz">Datenschutz</Link>
      </footer>
    </main>
  );
}
