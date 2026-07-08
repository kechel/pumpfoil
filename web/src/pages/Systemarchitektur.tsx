// Öffentliche „Systemarchitektur"-Seite (dritte Nerd-Seite, unter Teil 2). Nur Deutsch.
// Beschreibt den REALEN Aufbau des Servers — prüfbar für IT-Interessierte. KEINE Secrets:
// nur Verfahren/Design, keine Keys/JWT-Secrets/echten Hosts/IPs. Selbstgemalte SVG-Diagramme.
import { useEffect } from "react";
import { Link } from "react-router-dom";

const CARD = "rounded-2xl border border-slate-800 bg-slate-900/50 p-5 mb-6";
const H2 = "mb-2 text-lg font-bold text-slate-100";
const P = "text-sm leading-relaxed text-slate-300";

// kleine SVG-Bausteine
function Box({ x, y, w, h, title, sub, fill = "#0f172a", stroke = "#334155" }:
  { x: number; y: number; w: number; h: number; title: string; sub?: string; fill?: string; stroke?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 4 : h / 2 + 4)} textAnchor="middle" fontSize="13" fontWeight="600" fill="#e2e8f0">{title}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" fontSize="10.5" fill="#94a3b8">{sub}</text>}
    </g>
  );
}
const CYAN = "#22d3ee";

function Diagram({ title, viewBox, children }: { title: string; viewBox: string; children: React.ReactNode }) {
  return (
    <figure className="mb-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <svg viewBox={viewBox} className="mx-auto block h-auto w-full" style={{ minWidth: 640 }} role="img" aria-label={title}>
        <defs>
          <marker id="arr" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L7,3 L0,6 Z" fill={CYAN} />
          </marker>
        </defs>
        {children}
      </svg>
    </figure>
  );
}
const line = (x1: number, y1: number, x2: number, y2: number, dashed = false) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={CYAN} strokeWidth={1.6} markerEnd="url(#arr)" strokeDasharray={dashed ? "5 4" : undefined} opacity={0.85} />
);

export default function Systemarchitektur() {
  useEffect(() => { document.title = "Systemarchitektur · pumpfoil.org"; }, []);
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link to="/" className="text-sm text-brand-400 hover:underline">← Startseite</Link>
      <h1 className="mb-1 mt-4 text-2xl font-bold text-slate-100">Systemarchitektur</h1>
      <p className="mb-5 text-sm text-slate-400">
        Wie pumpfoil.org technisch aufgebaut ist — Stack, Datenbank, Sicherheit, Datenschutz. Bewusst
        transparent, damit man nachvollziehen und prüfen kann, wie mit den Daten umgegangen wird. Es
        werden nur Verfahren beschrieben, keine Geheimnisse (Schlüssel, Passwörter o. Ä.).
      </p>

      {/* 1. Stack / Deployment */}
      <section className={CARD}>
        <h2 className={H2}>1. Software-Stack & Betrieb</h2>
        <p className={`${P} mb-3`}>
          Bewusst schlank und „boring": <b>Python/FastAPI</b> hinter <b>uvicorn</b>, Daten in
          <b> PostgreSQL</b>, Dateien (Fotos, Rohdaten) im Dateisystem. Ein separater Reverse-Proxy
          (<b>Apache</b>) terminiert TLS und leitet weiter. Das React-Frontend ist eine <b>PWA</b>, die
          <i> vom Server als statische Dateien</i> ausgeliefert wird — kein Node.js im Betrieb (Node nur
          zum Bauen). Kein Redis/Message-Queue, keine Microservices.
        </p>
        <Diagram title="Deployment-Schichten" viewBox="0 0 720 360">
          {/* Client */}
          <Box x={20} y={150} w={120} h={56} title="Clients" sub="Browser · Apps · Uhren" />
          {line(140, 178, 200, 178)}
          <text x={170} y={170} textAnchor="middle" fontSize="10" fill={CYAN}>HTTPS</text>
          {/* Proxy VM */}
          <Box x={200} y={140} w={150} h={76} title="Reverse-Proxy-VM" sub="Apache · TLS (Let's Encrypt)" fill="#0b2530" stroke={CYAN} />
          {line(350, 178, 410, 178)}
          {/* App VM */}
          <rect x={410} y={40} width={290} height={280} rx={12} fill="#0b1220" stroke="#334155" strokeWidth={1.5} />
          <text x={555} y={62} textAnchor="middle" fontSize="12" fontWeight="700" fill="#94a3b8">App-VM (Linux · systemd)</text>
          <Box x={430} y={78} w={250} h={48} title="uvicorn + FastAPI" sub="1 Worker (async)" fill="#0b2530" stroke={CYAN} />
          <Box x={430} y={140} w={120} h={48} title="PostgreSQL" sub="29 Tabellen" />
          <Box x={560} y={140} w={120} h={48} title="Dateisystem" sub="media / data" />
          <Box x={430} y={202} w={250} h={44} title="Analyse-Pipeline" sub="GPS-Automat + On-Foil-Modell + Pump-Kadenz" />
          <Box x={430} y={260} w={250} h={44} title="Backups (systemd-Timer)" sub="pg_dump + Hardlinks, täglich" />
          {/* external */}
          <Box x={20} y={30} w={150} h={40} title="Externe Dienste" sub="OAuth · OSM · Push · Mail" fill="#1a1030" stroke="#a78bfa" />
          {line(95, 70, 430, 100, true)}
        </Diagram>
        <p className={`${P} text-xs`}>
          Diese VM erreicht die öffentliche Adresse selbst nicht — der Proxy liegt auf einer separaten
          VM. Externe Dienste (OpenStreetMap für Spot-/Wasserflächen, Web-Push, SMTP, OAuth) werden
          serverseitig angebunden.
        </p>
      </section>

      {/* 2. Clients & Uhren */}
      <section className={CARD}>
        <h2 className={H2}>2. Clients & Uhren</h2>
        <p className={`${P} mb-3`}>
          Alles spricht dieselbe <b>REST-API über HTTPS</b>. Die <b>Uhren sind „dünne Recorder"</b>: sie
          zeichnen GPS (+ Rohbeschleunigung, wo möglich) auf und laden hoch — die Auswertung passiert
          zentral am Server. Garmin lädt direkt über WLAN hoch; Wear&nbsp;OS / Apple&nbsp;Watch über die
          Begleit-App am Handy; Amazfit über die Zepp-App. Polar ist geplant (Roh-Accel per Bluetooth-SDK).
        </p>
        <Diagram title="Clients und Uhren" viewBox="0 0 720 380">
          {/* Server center */}
          <Box x={285} y={165} w={150} h={64} title="pumpfoil.org" sub="REST-API (HTTPS)" fill="#0b2530" stroke={CYAN} />
          {/* left: user clients */}
          {[["PC-Browser", "PWA/Web", 40], ["Android-Handy", "Browser/PWA + App", 110], ["iPhone", "Browser/PWA + App", 180]].map(([t, s, y]) => (
            <g key={t as string}>
              <Box x={20} y={y as number} w={175} h={46} title={t as string} sub={s as string} />
              {line(195, (y as number) + 23, 285, 197)}
            </g>
          ))}
          {/* right: watches */}
          {[["Garmin", "Connect IQ · direkt/WLAN", 30], ["Wear OS", "über Android-Handy", 92], ["Apple Watch", "über iPhone", 154], ["Amazfit", "über Zepp-App", 216], ["Polar (geplant)", "BLE-Sensor → Handy", 278]].map(([t, s, y], i) => (
            <g key={t as string}>
              <Box x={525} y={y as number} w={175} h={46} title={t as string} sub={s as string} stroke={i === 4 ? "#a78bfa" : "#334155"} />
              {line(525, (y as number) + 23, 435, 197, i === 4)}
            </g>
          ))}
          {/* top: external */}
          {[["Google", 250], ["Apple", 330], ["OSM", 410]].map(([t, x]) => (
            <g key={t as string}>
              <Box x={x as number} y={20} w={70} h={38} title={t as string} fill="#1a1030" stroke="#a78bfa" />
              {line((x as number) + 35, 58, 360, 165)}
            </g>
          ))}
        </Diagram>
        <p className={`${P} text-xs`}>
          Anmeldung wahlweise per E-Mail/Passwort oder „Mit Google/Apple anmelden" (OAuth). Cloud-Importe
          (Polar AccessLink, Suunto, COROS) liefern GPS-basierte Sessions ohne Rohbeschleunigung.
        </p>
      </section>

      {/* 3. Datenmodell */}
      <section className={CARD}>
        <h2 className={H2}>3. Datenmodell (Kern)</h2>
        <p className={`${P} mb-3`}>
          Im Zentrum steht der <b>Nutzer</b>, an dem <b>Sessions</b> hängen; jede Session hat Roh-Chunks
          (Upload) und genau ein <b>Analyse-Ergebnis</b>. Verweise auf Foil und Spot sind optional.
        </p>
        <Diagram title="ER-Diagramm (Kern-Entitäten)" viewBox="0 0 720 380">
          <Box x={40} y={160} w={130} h={60} title="users" sub="Konto, Rolle, Sprache" fill="#0b2530" stroke={CYAN} />
          <Box x={300} y={160} w={130} h={60} title="sessions" sub="Fahrt (GPS-Meta)" fill="#0b2530" stroke={CYAN} />
          <Box x={560} y={160} w={140} h={60} title="analysis_results" sub="Distanz, Läufe, Pumps" />
          <Box x={300} y={40} w={130} h={50} title="ingest_chunks" sub="Roh: GPS + Accel" />
          <Box x={300} y={280} w={130} h={50} title="device_tokens" sub="gepairte Uhr/App" />
          <Box x={520} y={280} w={90} h={50} title="foils" sub="Foil" />
          <Box x={620} y={280} w={80} h={50} title="spots" sub="Ort" />
          <Box x={40} y={40} w={130} h={50} title="oauth_identities" sub="Google/Apple" />
          <Box x={40} y={280} w={130} h={50} title="chat_messages" sub="Community-Chat" />
          {/* relations: users 1..N sessions */}
          {line(170, 190, 300, 190)}
          <text x={235} y={183} textAnchor="middle" fontSize="10" fill="#94a3b8">1 : N</text>
          {line(430, 190, 560, 190)}
          <text x={495} y={183} textAnchor="middle" fontSize="10" fill="#94a3b8">1 : 1</text>
          {line(365, 90, 365, 160)}{/* ingest -> session */}
          {line(365, 280, 365, 220)}{/* device -> session (owns) */}
          {line(105, 90, 105, 160)}{/* oauth -> users */}
          {line(105, 280, 105, 220)}{/* chat -> users */}
          {line(520, 295, 435, 210)}{/* foils -> sessions */}
          {line(640, 280, 420, 214)}{/* spots -> sessions */}
        </Diagram>
        <p className={`${P} text-xs`}>
          1:N = „ein Nutzer hat viele Sessions". Pfeile zeigen von der abhängigen zur referenzierten
          Tabelle (Fremdschlüssel). Alle weiteren Tabellen unten im Anhang.
        </p>
      </section>

      {/* 4. Daten-/Analyse-Fluss */}
      <section className={CARD}>
        <h2 className={H2}>4. Daten- & Analyse-Fluss</h2>
        <Diagram title="Vom Recorder zur Auswertung" viewBox="0 0 720 130">
          <Box x={10} y={45} w={120} h={48} title="Uhr/Recorder" sub="GPS + Accel" />
          {line(130, 69, 175, 69)}
          <Box x={175} y={45} w={130} h={48} title="Ingest" sub="Live-Chunks / FIT" fill="#0b2530" stroke={CYAN} />
          {line(305, 69, 350, 69)}
          <Box x={350} y={45} w={150} h={48} title="Analyse (Server)" sub="On-Foil-Modell + Pumps" fill="#0b2530" stroke={CYAN} />
          {line(500, 69, 545, 69)}
          <Box x={545} y={45} w={165} h={48} title="Ergebnis + Anzeige" sub="Karte, Läufe, Statistik" />
        </Diagram>
        <p className={`${P} text-xs`}>
          Zwei Upload-Wege (kontinuierliche Chunks während der Fahrt, oder nachträglicher FIT-Upload). Die
          Erkennung von On-Foil-Phasen und Pumps läuft <b>ausschließlich am Server</b> — Detektor-
          Verbesserungen wirken sofort für alle, ohne App-Update. Details in „Teil 2: Wie es funktioniert".
        </p>
      </section>

      {/* 5. Sicherheit */}
      <section className={CARD}>
        <h2 className={H2}>5. Sicherheit</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
          <li><b>Passwörter:</b> nie im Klartext. Gespeichert als <b>PBKDF2-HMAC-SHA256</b> mit
            <b> 200.000 Runden</b> und pro Passwort eigenem <b>16-Byte-Zufalls-Salt</b>; Vergleich
            zeitkonstant (<code>hmac.compare_digest</code>). Format <code>pbkdf2_sha256$runden$salt$hash</code>.</li>
          <li><b>Sitzungen:</b> <b>JWT</b> (HS256), langlebig mit gleitender Erneuerung (neuer Token per
            Antwort-Header, wenn Restlaufzeit klein wird). „Auf allen Geräten abmelden" über eine
            Sitzungs-Epoche pro Nutzer (ältere Tokens werden ungültig).</li>
          <li><b>Anmeldung:</b> zusätzlich OAuth „Mit Google/Apple anmelden"; OAuth-Cookies
            <code> HttpOnly</code>, <code>Secure</code>, <code>SameSite</code>.</li>
          <li><b>Transport:</b> HTTPS/TLS am Proxy, <b>HSTS</b> (1 Jahr), <code>X-Content-Type-Options: nosniff</code>,
            <code> X-Frame-Options: SAMEORIGIN</code>, GZip. Konto-Löschung (DSGVO) löscht alle Daten.</li>
          <li><b>Content-Security-Policy:</b> streng (<code>default-src 'self'</code>) — extern nur OSM-Kacheln
            (Bilder) und der YouTube-Klick-Embed, sonst ausschließlich eigene Quellen. Wird gerade behutsam
            eingeführt (zunächst Report-Only, danach erzwingend).</li>
          <li><b>Rate-Limits</b> auf sensiblen Endpunkten (siehe unten) gegen Brute-Force/Missbrauch.</li>
        </ul>
      </section>

      {/* 6. Rate-Limits */}
      <section className={CARD}>
        <h2 className={H2}>6. Rate-Limits</h2>
        <p className={`${P} mb-2`}>Gleitendes Zeitfenster je Client-IP + Zweck:</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-400"><th className="py-1 pr-4">Aktion</th><th className="py-1">Limit</th></tr></thead>
            <tbody className="text-slate-300">
              {[["Registrieren", "5 / Stunde"], ["Login", "10 / 5 min"], ["Passwort vergessen", "5 / 15 min"],
                ["Passwort zurücksetzen", "10 / 15 min"], ["Uhr-Pairing", "10 / 5 min"], ["Pairing-Init", "20 / 5 min"],
                ["Token minten (Companion)", "20 / 5 min"], ["Feedback senden", "20 / Stunde"]].map(([a, l]) => (
                <tr key={a} className="border-t border-slate-800"><td className="py-1 pr-4">{a}</td><td className="py-1 tabular-nums">{l}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 7. Datenschutz */}
      <section className={CARD}>
        <h2 className={H2}>7. Datenschutz</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
          <li><b>Null Cookies</b> für Tracking. Nur funktionales <code>localStorage</code> (Login-Token,
            Sprache, Theme). Deshalb kein Cookie-Banner nötig.</li>
          <li><b>Kein Analytics, keine Telemetrie</b> — in keiner Komponente, bewusste harte Vorgabe.</li>
          <li>Keine Dritt-Skripte/-Fonts/-Karten von externen Hosts. YouTube nur als Klick-zum-Laden über
            <code> youtube-nocookie.com</code>.</li>
          <li><b>Konto- & Datenlöschung</b> in der App (DSGVO): entfernt Konto und alle zugehörigen Daten.</li>
        </ul>
      </section>

      {/* 8. Grenzen / Trade-offs */}
      <section className={CARD}>
        <h2 className={H2}>8. Grenzen & bewusste Trade-offs</h2>
        <p className={`${P} mb-2`}>Ehrlich, damit man das Sicherheitsniveau richtig einordnen kann:</p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
          <li><b>Bewusst Ein-Prozess-Betrieb</b> (ein uvicorn-Worker): einfach, gut prüfbar, und
            Rate-Limits/Fortschritts-Zustände bleiben konsistent. Klarer Skalierungspfad: bei steigender
            Last werden diese Zustände nach PostgreSQL verlagert und auf mehrere Worker erhöht.</li>
          <li>App-Server auf <b>einer</b> VM (kein Auto-Scaling/Failover) — dafür einfache, gut prüfbare Struktur.</li>
          <li>Rate-Limiter ist bewusst simpel (In-Memory-Sliding-Window), kein externer Dienst.</li>
          <li>Projekt ist <b>Open Source (AGPL)</b> — der komplette Code ist öffentlich einsehbar und prüfbar.</li>
        </ul>
      </section>

      {/* 9. Tabellen-Anhang */}
      <section className={CARD}>
        <h2 className={H2}>Anhang: alle Tabellen</h2>
        <p className={`${P} mb-2`}>29 Tabellen (PostgreSQL). Fremdschlüssel in Klammern.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-400"><th className="py-1 pr-3">Tabelle</th><th className="py-1 pr-3">FK</th><th className="py-1">Zweck</th></tr></thead>
            <tbody className="text-slate-300">
              {([
                ["users", "—", "Konten (Rolle, Sprache, Empfindlichkeit)"],
                ["sessions", "user, device_token, foil", "Fahrten (GPS-Metadaten, Status)"],
                ["analysis_results", "session", "Auswertung: Distanz, Läufe, Pumps, Segmente"],
                ["ingest_chunks", "session", "Roh-Upload-Chunks (GPS/Accel)"],
                ["device_tokens", "user", "Gepairte Uhr/App (Plattform, Token)"],
                ["device_pairings", "user", "Reverse-Pairing (Uhr-Code)"],
                ["pairing_codes", "user", "Forward-Pairing (App-Code)"],
                ["foils", "—", "Foil-Katalog (Marke/Modell/Größe)"],
                ["spots", "—", "Spots (Ort/Gewässer, aus Track-Clustern)"],
                ["oauth_identities", "user", "Google/Apple-Verknüpfung"],
                ["polar_links", "user", "Polar-AccessLink-Konto"],
                ["coros_links", "user", "COROS-Konto"],
                ["suunto_links", "user", "Suunto-Konto"],
                ["strava_links", "user", "Strava-Konto (ruhend)"],
                ["chat_messages", "user", "Community-/Spot-/Direkt-Chat"],
                ["chat_room_state", "user", "Pro Raum: gelesen/verlassen/Abo"],
                ["chat_reports", "message, user", "Gemeldete Nachrichten"],
                ["user_blocks", "blocker, blocked", "Blockierungen (1:1-Chat)"],
                ["push_subscriptions", "user", "Web-Push-Endpunkte"],
                ["session_likes", "user, session", "Likes"],
                ["session_votes", "user, session", "Bewertungen"],
                ["session_photos", "session, user", "Foto-Uploads"],
                ["labels", "session", "Ground-Truth-Labels (Training)"],
                ["pump_truth", "session", "Pump-Wahrheit (Kalibrierung)"],
                ["water_polygons", "—", "Gecachte OSM-Wasserflächen"],
                ["news_banner", "—", "News-Banner (Singleton)"],
                ["password_resets", "user", "Passwort-Reset-Token"],
                ["feedback", "user", "Nutzer-Feedback"],
                ["admin_audit", "admin", "Admin-Aktionen (Audit-Log)"],
              ] as [string, string, string][]).map(([t, fk, z]) => (
                <tr key={t} className="border-t border-slate-800 align-top">
                  <td className="py-1 pr-3 font-medium text-slate-100"><code>{t}</code></td>
                  <td className="py-1 pr-3 text-slate-400">{fk}</td>
                  <td className="py-1">{z}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mb-8 text-xs text-slate-500">
        Stand automatisch aus dem Code abgeleitet. Der gesamte Quellcode ist öffentlich (AGPL).
      </p>
    </div>
  );
}
