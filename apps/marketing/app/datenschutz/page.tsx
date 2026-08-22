import type { Metadata } from "next";
import Link from "next/link";
import {
  LEGAL_VALUE_MISSING,
  legalContact,
  legalContactIsComplete,
  PRIVACY_NOTICE_VERSION,
} from "../legal-config";

export const metadata: Metadata = {
  title: "Datenschutz — Tripatlas",
  description: "Datenschutzhinweise für die Tripatlas-Website und Warteliste.",
};

function ContactDetails() {
  return (
    <address>
      <strong>{legalContact.providerName}</strong><br />
      {legalContact.streetAddress || LEGAL_VALUE_MISSING}<br />
      {legalContact.postalCodeAndCity || LEGAL_VALUE_MISSING}<br />
      {legalContact.email || LEGAL_VALUE_MISSING}
    </address>
  );
}

export default function DatenschutzPage() {
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
            Private Vorschau: Verantwortlichen-Kontaktdaten und die
            Hosting-Vertragsdetails müssen vor einem öffentlichen Launch
            vervollständigt und geprüft werden.
          </aside>
        )}

        <p className="section-kicker">Deine Daten</p>
        <h1>Datenschutzerklärung</h1>
        <p className="legal-updated">
          Version {PRIVACY_NOTICE_VERSION} · Stand: 22. August 2026
        </p>

        <section>
          <h2>1. Verantwortlicher</h2>
          <ContactDetails />
        </section>

        <section>
          <h2>2. Aufruf dieser Website</h2>
          <p>
            Beim Aufruf der Website werden die technisch erforderlichen
            Verbindungs- und Protokolldaten verarbeitet, die für die
            Auslieferung, Stabilität und Sicherheit der Seite benötigt werden.
            Dazu können insbesondere IP-Adresse, Zeitpunkt, aufgerufene Seite
            und technische Browserangaben gehören.
          </p>
          <p>
            Rechtsgrundlage ist Art. 6 Abs. 1 Buchst. f DSGVO. Das berechtigte
            Interesse besteht im sicheren und zuverlässigen Betrieb der
            Website. Tripatlas setzt auf dieser Marketingseite keine eigenen
            Werbe- oder Profiling-Cookies und kein eigenes Werbetracking ein.
          </p>
        </section>

        <section>
          <h2>3. Technische Bereitstellung über OpenAI Sites</h2>
          <p>
            Die aktuelle Vorschau wird technisch über OpenAI Sites
            bereitgestellt. Dabei können Daten durch den Plattformanbieter und
            dessen Unterauftragnehmer verarbeitet werden. Die OpenAI-
            Dokumentation weist für Sites derzeit darauf hin, dass zum Start
            keine Datenresidenz angeboten wird. Eine Verarbeitung außerhalb
            Deutschlands oder des Europäischen Wirtschaftsraums kann daher
            nicht ausgeschlossen werden. Siehe die{" "}
            <a href="https://learn.chatgpt.com/docs/sites">
              OpenAI-Dokumentation zu Sites
            </a>.
          </p>
          <p>
            Vor der öffentlichen Freigabe werden Vertragspartner,
            Auftragsverarbeitung, konkrete Speicherdauern und gegebenenfalls
            die Garantien für Drittlandübermittlungen abschließend geprüft und
            dieser Abschnitt entsprechend aktualisiert.
          </p>
        </section>

        <section>
          <h2>4. Early-Access-Warteliste</h2>
          <p>
            Wenn du dich einträgst, speichern wir deine E-Mail-Adresse, dein
            Interesse an Hosted und/oder Self-hosted, deine freiwillige Angabe
            zur TeslaMate-Erfahrung sowie Zeitpunkt und Version deiner
            Einwilligung. Die Angaben werden ausschließlich verwendet, um die
            Nachfrage zu bewerten und dich zum Early Access zu kontaktieren.
          </p>
          <p>
            Rechtsgrundlage ist deine Einwilligung nach Art. 6 Abs. 1 Buchst. a
            DSGVO. Die Eintragung ist freiwillig. Du kannst deine Einwilligung
            jederzeit mit Wirkung für die Zukunft über die oben genannte
            Kontaktadresse widerrufen. Die Rechtmäßigkeit der Verarbeitung bis
            zum Widerruf bleibt unberührt.
          </p>
          <p>
            Wir speichern die Wartelistendaten bis die Early-Access-
            Kommunikation abgeschlossen ist, der Zweck entfällt oder du deine
            Einwilligung widerrufst. Nach einem Widerruf werden die Daten
            gelöscht, sofern keine gesetzlichen Pflichten oder die notwendige
            Verteidigung von Rechtsansprüchen eine begrenzte weitere
            Aufbewahrung verlangen. Eine Weitergabe zu Werbezwecken und ein
            Verkauf der Daten finden nicht statt.
          </p>
        </section>

        <section>
          <h2>5. Empfänger</h2>
          <p>
            Zugriff erhalten nur Personen und technische Dienstleister, die
            ihn für Betrieb, Sicherheit und Early-Access-Kommunikation
            benötigen. Die Wartelistendaten werden in der zum Sites-Projekt
            gehörenden Datenbank gespeichert. Weitere Empfänger werden nur
            eingesetzt, wenn dies erforderlich, gesetzlich erlaubt oder von
            dir eingewilligt ist.
          </p>
        </section>

        <section>
          <h2>6. Deine Rechte</h2>
          <p>
            Du hast im Rahmen der gesetzlichen Voraussetzungen Rechte auf
            Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung
            und Datenübertragbarkeit. Du kannst einer auf Art. 6 Abs. 1
            Buchst. f DSGVO beruhenden Verarbeitung aus Gründen deiner
            besonderen Situation widersprechen und eine erteilte Einwilligung
            jederzeit für die Zukunft widerrufen.
          </p>
          <p>
            Außerdem kannst du dich bei einer Datenschutzaufsichtsbehörde
            beschweren, insbesondere an deinem Aufenthaltsort, Arbeitsplatz
            oder am Ort des vermuteten Verstoßes.
          </p>
        </section>

        <section>
          <h2>7. Änderungen</h2>
          <p>
            Diese Datenschutzerklärung wird angepasst, wenn sich Funktionen,
            Dienstleister oder Rechtsgrundlagen ändern. Die jeweils aktuelle
            Version ist auf dieser Seite angegeben.
          </p>
        </section>
      </article>

      <footer className="legal-footer shell">
        <Link href="/">Startseite</Link>
        <Link href="/impressum">Impressum</Link>
      </footer>
    </main>
  );
}
