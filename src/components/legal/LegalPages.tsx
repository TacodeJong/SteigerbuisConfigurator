import type { ReactNode } from 'react'
import { navigate } from '../../lib/routing'

const UPDATED = '20 juli 2026'
const SITE = 'https://steigerbuisontwerpen.nl'
const CONTACT = 'info@steigerbuisontwerpen.nl'

function LegalShell({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <main className="app-page legal-page">
      <button type="button" className="linkish" onClick={() => navigate({ name: 'app' })}>
        ← Terug naar ontwerpen
      </button>
      <h1>{title}</h1>
      <p className="muted legal-meta">
        Laatst bijgewerkt: {UPDATED}. Dit is een praktische basisverklaring voor{' '}
        <a href={SITE}>{SITE.replace('https://', '')}</a> — geen juridisch advies. Pas gegevens
        (contact, bewaartermijnen) aan waar nodig.
      </p>
      <div className="legal-body">{children}</div>
    </main>
  )
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacyverklaring">
      <h2>1. Wie is verantwoordelijk?</h2>
      <p>
        De verwerkingsverantwoordelijke voor deze website en app is de exploitant van Steigerbuis
        Ontwerpen ({SITE}). Vragen over privacy: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2>2. Welke gegevens verwerken we?</h2>
      <ul>
        <li>
          <strong>Accountgegevens</strong> — e-mailadres, wachtwoordhash (via authenticatie),
          weergavenaam en abonnementsstatus.
        </li>
        <li>
          <strong>Ontwerpen</strong> — opgeslagen 3D-modellen, configuraties, publicatiestatus en
          (optioneel) sociale interacties zoals favorieten en volgen.
        </li>
        <li>
          <strong>Betalingen</strong> — orderreferenties en betaalstatus via Mollie; wij slaan geen
          volledige betaalkaart- of iDEAL-gegevens op.
        </li>
        <li>
          <strong>Technische gegevens</strong> — IP-adres en loggegevens bij gebruik van hosting,
          authenticatie en edge functions (foutopsporing en beveiliging).
        </li>
        <li>
          <strong>Lokale opslag</strong> — voorkeuren in de browser (bijv. thema, welkomstscherm),
          zonder dat dit naar ons wordt gestuurd tenzij je inlogt of opslaat.
        </li>
      </ul>

      <h2>3. Doelen en rechtsgrond (AVG)</h2>
      <ul>
        <li>
          <strong>Uitvoering van de overeenkomst</strong> — account, cloud-opslag, exports en
          abonnementen/aankopen (art. 6 lid 1 sub b AVG).
        </li>
        <li>
          <strong>Gerechtvaardigd belang</strong> — beveiliging, misbruikpreventie, verbetering van
          de dienst en anonieme gebruiksstatistieken waar van toepassing (art. 6 lid 1 sub f AVG).
        </li>
        <li>
          <strong>Wettelijke verplichting</strong> — waar administratie- of bewaarplichten gelden
          voor betalingen (art. 6 lid 1 sub c AVG).
        </li>
      </ul>

      <h2>4. Verwerkers en doorgifte</h2>
      <ul>
        <li>
          <strong>Supabase</strong> (EU) — authenticatie, database en opslag van cloud-modellen.
        </li>
        <li>
          <strong>Mollie</strong> — betalingsverwerking (o.a. iDEAL). Mollie is zelf
          verwerkingsverantwoordelijke of verwerker volgens hun voorwaarden.
        </li>
        <li>
          Hosting van de statische frontend (bijv. webhosting in de EU). Gegevens worden zo veel
          mogelijk binnen de EER verwerkt.
        </li>
      </ul>

      <h2>5. Bewaartermijnen</h2>
      <ul>
        <li>Account- en profielgegevens: zolang het account actief is.</li>
        <li>
          Cloud-modellen: tot je ze verwijdert, of tot accountverwijdering volgens onze
          verwijderprocedure.
        </li>
        <li>
          Betaal- en abonnementsadministratie: tot maximaal de wettelijke bewaartermijn (vaak tot 7
          jaar voor fiscale stukken), of korter als alleen status in ons systeem nodig is.
        </li>
        <li>Logs: typisch kort (dagen tot enkele weken), tenzij nodig voor incidentonderzoek.</li>
      </ul>

      <h2>6. Jouw rechten</h2>
      <p>
        Je hebt onder de AVG onder meer recht op inzage, rectificatie, wissing, beperking,
        dataportabiliteit en bezwaar. Je kunt je account in de app laten verwijderen waar die
        functie beschikbaar is, of mailen naar <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Je mag
        ook een klacht indienen bij de Autoriteit Persoonsgegevens.
      </p>

      <h2>7. Cookies en tracking</h2>
      <p>
        We gebruiken geen marketing- of trackingcookies van derden voor advertenties. Essentiële
        opslag (sessie/localStorage) is nodig voor inloggen en voorkeuren. Analytics, als die later
        worden toegevoegd, worden bij voorkeur privacyvriendelijk en met toestemming waar vereist
        ingericht.
      </p>

      <h2>8. Beveiliging</h2>
      <p>
        We nemen passende technische en organisatorische maatregelen (o.a. HTTPS, toegangscontrole
        via Supabase, gescheiden betaalomgeving). Absolute veiligheid bestaat niet; meld
        vermoedelijke incidenten zo snel mogelijk.
      </p>
    </LegalShell>
  )
}

export function TermsPage() {
  return (
    <LegalShell title="Algemene voorwaarden">
      <h2>1. Dienst</h2>
      <p>
        Steigerbuis Ontwerpen biedt een online configurator en 3D-editor om constructies van
        steigerbuis te ontwerpen, stuklijsten te bekijken en (tegen betaling) documenten te
        exporteren of cloud-functies te gebruiken. De site is bedoeld voor particulier en licht
        professioneel gebruik.
      </p>

      <h2>2. Account</h2>
      <p>
        Je bent verantwoordelijk voor je inloggegevens en voor hetgeen onder je account gebeurt.
        Gegevens moeten juist zijn. Misbruik, scraping of verstoring van de dienst is niet
        toegestaan. We mogen accounts opschorten bij fraude of schending van deze voorwaarden.
      </p>

      <h2>3. Gratis en betaalde functies</h2>
      <ul>
        <li>Basisontwerpen en een eenvoudige stuklijst kunnen gratis beschikbaar zijn.</li>
        <li>
          Betaalde opties (bijv. maandabonnement of eenmalige export) worden duidelijk getoond vóór
          betaling via Mollie.
        </li>
        <li>
          Prijzen zijn in euro’s; eventuele kortingscodes gelden alleen binnen de gestelde
          voorwaarden.
        </li>
      </ul>

      <h2>4. Betaling en verlenging</h2>
      <p>
        Betalingen verlopen via Mollie. Bij een tijdelijk abonnement krijg je toegang voor de
        aangegeven periode. Verlengd per maand. Maandelijks opzegbaar. Een eenmalige aankoop
        (bijvoorbeeld ontgrendeling van een printfunctie per model) geeft de rechten die bij die
        aankoop horen, zonder doorlopend abonnement tenzij anders vermeld. Herroepingsrecht voor
        digitale diensten kan beperkt zijn wanneer je meteen toegang krijgt — zie ook
        Mollie/wettelijke regels.
      </p>

      <h2>5. Ontwerpen en intellectuele eigendom</h2>
      <ul>
        <li>
          Jij blijft eigenaar van je eigen ontwerpen. Door te publiceren geef je ons een
          niet-exclusieve licentie om het model in de galerij te tonen.
        </li>
        <li>
          “Bewerken voor jezelf” / overnemen van een openbaar model is alleen toegestaan binnen de
          app-regels en je abonnement.
        </li>
        <li>
          De software, merknamen en standaardcatalogus van de site blijven eigendom van de
          exploitant of licentiegevers.
        </li>
      </ul>

      <h2>6. Geen bouwadvies of offerte</h2>
      <p>
        Maten, stuklijsten en prijsindicaties zijn hulpmiddelen. Controleer altijd in de praktijk
        (en bij een leverancier). Wij zijn geen aannemer of leverancier van steigerbuis; bestellingen
        doe je zelf bij derden. Gebruik op eigen risico.
      </p>

      <h2>7. Beschikbaarheid</h2>
      <p>
        We streven naar een stabiele dienst maar geven geen garantie op ononderbroken beschikbaarheid.
        Onderhoud, storingen bij Supabase/Mollie/hosting of overmacht kunnen de dienst beperken.
      </p>

      <h2>8. Aansprakelijkheid</h2>
      <p>
        Voor zover wettelijk toegestaan is onze aansprakelijkheid beperkt tot het bedrag dat je in
        de twaalf maanden vóór de claim via de app aan ons hebt betaald (of nihil bij gratis
        gebruik). Wij zijn niet aansprakelijk voor gevolgschade, gederfde winst of schade door
        montagefouten.
      </p>

      <h2>9. Privacy</h2>
      <p>
        Verwerking van persoonsgegevens staat in de{' '}
        <button type="button" className="linkish" onClick={() => navigate({ name: 'privacy' })}>
          privacyverklaring
        </button>
        .
      </p>

      <h2>10. Wijzigingen</h2>
      <p>
        We mogen deze voorwaarden bijwerken. De datum bovenaan geldt als peildatum. Bij
        materiële wijzigingen proberen we gebruikers redelijk te informeren. Voor vragen:{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </LegalShell>
  )
}
