import { Card } from "./ui";

// Einrichtungs-Anleitung im Uhren-Bereich. Sprung-Links scrollen zur jeweiligen
// Plattform-Sektion. Deutsch-first (andere Sprachen fallen via i18n auf DE zurück).
function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const platforms = [
  { id: "guide-garmin", label: "Garmin" },
  { id: "guide-apple", label: "Apple Watch" },
  { id: "guide-wear", label: "Wear OS" },
];

// Garmin-Anleitungs-Screenshots (v1.0.24, rund) — erzeugt von scripts/make-landing-watch-shots.py.
const garminShots = [
  { src: "/guide/garmin/start.webp", cap: "Start: GPS bereit → START" },
  { src: "/guide/garmin/settings.webp", cap: "MENU halten → Einstellungen" },
  { src: "/guide/garmin/pairing-code.webp", cap: "Verbinden — Code an der Uhr" },
  { src: "/guide/garmin/pairing-success.webp", cap: "Verbunden" },
  { src: "/guide/garmin/alarm-1.webp", cap: "Alarm wählen" },
  { src: "/guide/garmin/alarm-2.webp", cap: "Alarm — Foil / feste Werte" },
  { src: "/guide/garmin/alarm-3.webp", cap: "Alarm — Auslösen" },
  { src: "/guide/garmin/on-foil-1.webp", cap: "Während der Fahrt" },
  { src: "/guide/garmin/on-foil-2.webp", cap: "Während der Fahrt" },
];

// Apple-Watch-Anleitungs-Screenshots (rechteckig).
const appleShots = [
  { src: "/guide/apple/connect.webp", cap: "Verbinden — Code erzeugen" },
  { src: "/guide/apple/code.webp", cap: "Code → auf pumpfoil.org" },
  { src: "/guide/apple/start.webp", cap: "Start" },
  { src: "/guide/apple/alarm.webp", cap: "Alarm wählen + Auslösen" },
  { src: "/guide/apple/data-1.webp", cap: "Während der Fahrt" },
  { src: "/guide/apple/data-2.webp", cap: "Während der Fahrt" },
  { src: "/guide/apple/stop.webp", cap: "Stop" },
  { src: "/guide/apple/upload.webp", cap: "Upload nach dem Stopp" },
];

export function WatchGuide() {
  return (
    <div className="space-y-5">
      {/* Sprung-Navigation */}
      <Card className="p-5">
        <h3 className="font-semibold">So richtest du deine Uhr ein</h3>
        <p className="mt-1 text-sm text-slate-300">
          Wähle deine Plattform — oder scroll dich durch.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {platforms.map((p) => (
            <button
              key={p.id}
              onClick={() => jump(p.id)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-700"
            >
              {p.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Garmin */}
      <Card id="guide-garmin" className="scroll-mt-20 p-5">
        <h3 className="text-lg font-bold text-brand-400">Garmin</h3>
        <p className="mt-1 text-sm text-slate-300">Fenix, Forerunner, Epix, Instinct …</p>
        <ol className="mt-4 space-y-3 text-sm text-slate-200">
          <li><b>1. App installieren:</b> „Pump Foil" aus dem Connect&nbsp;IQ&nbsp;Store laden — oder die
            <code className="mx-1 rounded bg-slate-800 px-1">.prg</code> für dein Modell von hier herunterladen
            (Tab „App") und mit <a href="https://openmtp.ganeshrvel.com/" target="_blank" rel="noopener noreferrer" className="text-brand-400 underline hover:text-brand-300"><b>OpenMTP</b></a> in den Ordner <code className="mx-1 rounded bg-slate-800 px-1">GARMIN/APPS/</code>
            der Uhr kopieren.</li>
          <li><b>2. Code an der Uhr erzeugen:</b> Pump Foil öffnen (nicht starten) →
            <b> MENU halten</b> (Knopf Mitte-links) → <b>„Einstellungen"</b> → <b>„Verbinden"</b>.
            Die Uhr zeigt einen 6-stelligen Code (Handy in der Nähe oder WLAN nötig).</li>
          <li><b>3. Code hier eintragen:</b> Tab <b>„Verbinden"</b> → „Code von der Uhr eingeben".
            Fertig — die Uhr ist deinem Konto zugeordnet.</li>
          <li><b>4. Datenfelder &amp; Alarm:</b> hier auf pumpfoil.org in den Tabs <b>„Datenfelder"</b>
            (bis zu 3 pro Screen) und <b>„Alarm"</b> einstellen — wird nach dem Verbinden auf die Uhr geladen.</li>
          <li><b>5. Aufnehmen:</b> App öffnen → <b>„GPS bereit"</b> abwarten → <b>START</b> → foilen →
            START <b>3&nbsp;s halten</b> zum Stoppen &amp; Speichern.</li>
          <li><b>6. Upload:</b> automatisch beim nächsten App-Start (WLAN/Telefon), oder manuell
            <b> MENU → Einstellungen → „Upload / Sync"</b>. Danach erscheint die Session hier.</li>
        </ol>
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-slate-400">So sieht's auf der Uhr aus (v1.0.24):</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {garminShots.map((s) => (
              <figure key={s.src} className="flex flex-col items-center gap-1">
                <img src={s.src} alt={s.cap} loading="lazy"
                  className="w-full rounded-full border border-slate-800 shadow" />
                <figcaption className="text-center text-[11px] leading-tight text-slate-500">{s.cap}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </Card>

      {/* Apple Watch */}
      <Card id="guide-apple" className="scroll-mt-20 p-5">
        <h3 className="text-lg font-bold text-brand-400">Apple Watch</h3>
        <p className="mt-1 text-sm text-slate-300">watchOS 9+</p>
        <ol className="mt-4 space-y-3 text-sm text-slate-200">
          <li><b>1. App installieren:</b> aus dem App&nbsp;Store / TestFlight (in Vorbereitung).</li>
          <li><b>2. Verbinden — optional:</b> Du kannst <b>sofort ohne Konto aufnehmen</b>
            („Später verbinden") und die Session später hochladen. Zum Zuordnen: in der Watch-App
            <b> „Verbinden" → „Pairing-Code erzeugen"</b> — den angezeigten Code hier im Tab
            <b> „Verbinden"</b> eintragen.</li>
          <li><b>3. Datenfelder:</b> direkt auf der Uhr <b>wischbare Seiten</b> (konfigurierbar im Tab
            „Datenfelder"). Stopp-Button am Anfang und Ende der Seiten.</li>
          <li><b>4. Aufnehmen:</b> App öffnen → <b>Start</b> → foilen → <b>Stop</b>. Aufnahme läuft auch
            offline; Sync passiert automatisch, sobald online.</li>
        </ol>
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-slate-400">So sieht's auf der Uhr aus:</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {appleShots.map((s) => (
              <figure key={s.src} className="flex flex-col items-center gap-1">
                <img src={s.src} alt={s.cap} loading="lazy"
                  className="w-full rounded-2xl border border-slate-800 shadow" />
                <figcaption className="text-center text-[11px] leading-tight text-slate-500">{s.cap}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </Card>

      {/* Wear OS */}
      <Card id="guide-wear" className="scroll-mt-20 p-5">
        <h3 className="text-lg font-bold text-brand-400">Wear OS</h3>
        <p className="mt-1 text-sm text-slate-300">Samsung Galaxy Watch, Google Pixel Watch …</p>
        <ol className="mt-4 space-y-3 text-sm text-slate-200">
          <li><b>1. App installieren:</b> aus dem Google&nbsp;Play&nbsp;Store (in Vorbereitung).</li>
          <li><b>2. Verbinden — optional:</b> wie bei Apple Watch — <b>ohne Konto aufnehmen</b> möglich,
            später verbinden; oder in der Uhr-App <b>„Verbinden" → „Pairing-Code erzeugen"</b> und den
            Code hier im Tab „Verbinden" eintragen.</li>
          <li><b>3. Datenfelder:</b> wischbare Seiten, konfigurierbar im Tab „Datenfelder".</li>
          <li><b>4. Aufnehmen:</b> App öffnen → <b>Start</b> → foilen → <b>Stop</b>. Offline-Aufnahme +
            automatischer Sync.</li>
        </ol>
      </Card>
    </div>
  );
}
