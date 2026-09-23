#!/usr/bin/env node
// Ein Einstieg fuer beides: Simulator und Store-Paket.
//
// WARUM ES DAS GIBT (19.09.2026): Amazfit 1.0.11 ging mit `DEV_FAKE_GPS = true` in den Zepp-Store
// und musste zurueckgezogen werden. Mit dem Schalter liest die Uhr die echte Ortung NIE (`s.geo`
// wird uebersprungen) und schreibt eine erfundene Spur ab 47.66/9.355 mit 19-24 km/h — jede
// Aufnahme jedes Nutzers waere eine Phantom-Session am Bodensee gewesen, hochgeladen als echte.
//
// Der Fehler lag NICHT in der Sorgfalt, sondern im Ablauf: fuer die Store-Screenshots MUSS der
// Schalter an sein (der Simulator speist kein GPS ein) — und unmittelbar danach wird gebaut. Eine
// Zeile in einer Checkliste schuetzt davor nicht; ein Mensch soll sich das nicht merken muessen.
//
// Jans Vorgabe: „das soll nur automatisch bei zeus dev aber NIE bei zeus build aktiviert sein",
// und vor allem: „ICH MUSS KEINE DATEI EDITIEREN". Deshalb liegt der Wert NICHT im Quelltext,
// sondern in der erzeugten, GITIGNORIERTEN `page/devflags.js`, die dieses Skript vor jedem Lauf
// schreibt. Eine ENV-Variable ginge nicht: der Uhr-Code laeuft nicht in Node, `process.env` gibt
// es dort nicht, der Wert muss beim Buendeln feststehen — und `zeus` kennt kein `--define`.
//
//     npm run dev      ->  DEV_FAKE_GPS = true   ->  zeus dev     (Simulator, Screenshots)
//     npm run dev-echt ->  DEV_FAKE_GPS = false  ->  zeus dev     (Simulator, ECHTE Ortung)
//     npm run build    ->  DEV_FAKE_GPS = false  ->  zeus build   (Store-Paket)
//
// `dev-echt` AENDERT AN DER SICHERUNG NICHTS, und das ist der Punkt: es schreibt `false`, also
// den sicheren Wert. Der einzige Weg, auf dem ein `true` je in ein Paket kaeme, ist `build` — und
// der setzt weiterhin selbst `false`, baut, und prueft danach das ERGEBNIS (`paketPruefen`), statt
// jemandem zu glauben. Die neue Betriebsart kann nur in die harmlose Richtung wirken: im
// schlimmsten Fall steht `false`, wo jemand die Fake-Spur erwartet hat, und der Simulator zeigt
// „GPS suche…".
//
// `dev-echt` kam am 23.09.2026 dazu, beim Schreiben von TESTPLAN-EMULATOR.md. Der Fake-Zweig
// ueberspringt `s.geo` KOMPLETT — und damit auch den `onChange`-Zwischenspeicher, der in 1.0.12
// gegen die GPS-Luecken eingebaut wurde. Unter `npm run dev` laesst sich der neue Pfad also gar
// nicht testen, er liegt hinter dem Schalter. Fuer Screenshots bleibt `dev` richtig: der
// Simulator speist kein GPS ein, ohne Fake-Spur steht die Anzeige auf „GPS suche…".
//
// Damit ist egal, was gerade in der Datei steht oder was jemand vergessen hat zurueckzustellen.
// Nach dem Bauen wird das ERGEBNIS geprueft, nicht die Eingabe: enthaelt das Paket die Fake-Spur,
// ohne den echten GPS-Pfad zu enthalten, bricht das Skript ab UND loescht die Ausgabe — ein
// Paket, das man nicht mehr hochladen kann, ist die einzige Sicherung, die wirklich haelt.
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = dirname(fileURLToPath(import.meta.url));
const QUELLE = join(WURZEL, "page", "index.js");   // nur noch fuer den Versionsabgleich
const FLAGS = join(WURZEL, "page", "devflags.js");

/** Schreibt `page/devflags.js`. Die Datei ist gitignoriert und wird bei JEDEM Lauf neu erzeugt —
 *  im Arbeitsbaum bleibt damit nichts stehen, was jemand vergessen koennte. */
function schalter(wert) {
  writeFileSync(FLAGS,
    "// ERZEUGT von zepp.mjs — nicht von Hand aendern, nicht versionieren (s. .gitignore).\n" +
    "// true = synthetische GPS-Spur fuer den Simulator, false = echte Ortung.\n" +
    `export const DEV_FAKE_GPS = ${wert};\n`, "utf8");
  console.log(`page/devflags.js: DEV_FAKE_GPS = ${wert}`);
}

/** Alle Dateien unter einem Verzeichnis (fuer die Nachpruefung des Pakets). */
function dateien(pfad, raus = []) {
  if (!existsSync(pfad)) return raus;
  for (const name of readdirSync(pfad)) {
    const p = join(pfad, name);
    if (statSync(p).isDirectory()) dateien(p, raus);
    else raus.push(p);
  }
  return raus;
}

/** Traegt das gebaute Paket die Fake-Spur statt der echten Ortung?
 *
 *  DREI EBENEN AUSPACKEN, nicht im rohen Puffer suchen. Erste Fassung dieses Skripts tat genau
 *  das und waere bei JEDEM Build falsch Alarm geschlagen: die inneren Archive sind DEFLATE-
 *  komprimiert, `strings` auf dem .zab findet weder `getLatitude` noch `_flat` (nachgemessen am
 *  zurueckgezogenen Paket: 0 Treffer auf beiden). Der Weg ist
 *      dist/*.zab  ->  *.zpk  ->  device.zip  ->  page/index.bin
 *  und erst in der Zeichentabelle dieser kompilierten Datei stehen die Bezeichner.
 *
 *  Woran es erkennbar ist (am kaputten 1.0.11 vom 18.09. geeicht): bei `DEV_FAKE_GPS = true`
 *  wirft der Bundler den echten Zweig komplett weg — `_flat`/`_flon` sind drin,
 *  `getLatitude`/`getLongitude`/`getStatus` fehlen.
 */
function paketPruefen() {
  const dist = join(WURZEL, "dist");
  const zabs = dateien(dist).filter((f) => f.endsWith(".zab"));
  if (!zabs.length) {
    console.error("ABBRUCH: in dist/ liegt kein .zab — wurde ueberhaupt gebaut?");
    return false;
  }
  const zab = zabs.sort()[zabs.length - 1];
  const tmp = mkdtempSync(join(tmpdir(), "zepp-pruef-"));
  const auspacken = (archiv, ziel) =>
    spawnSync("unzip", ["-o", "-q", archiv, "-d", ziel], { stdio: "pipe" }).status === 0;
  try {
    if (!auspacken(zab, tmp)) { console.error(`ABBRUCH: ${zab} laesst sich nicht auspacken.`); return false; }
    for (const zpk of dateien(tmp).filter((f) => f.endsWith(".zpk"))) auspacken(zpk, zpk + ".aus");
    for (const dz of dateien(tmp).filter((f) => f.endsWith("device.zip"))) auspacken(dz, dz + ".aus");
    const hat = (buf, wort) => buf.includes(Buffer.from(wort, "latin1"));
    let echt = 0, fake = 0, bins = 0;
    for (const f of dateien(tmp).filter((f) => f.endsWith(".bin"))) {
      const buf = readFileSync(f);
      bins++;
      if (hat(buf, "getLatitude") || hat(buf, "getLongitude")) echt++;
      if (hat(buf, "_flat") && hat(buf, "_flon")) fake++;
    }
    if (!bins) { console.error("ABBRUCH: im Paket ist keine kompilierte .bin zu finden."); return false; }
    if (echt === 0) {
      console.error("\nABBRUCH: im gebauten Paket ist KEIN Aufruf der echten Ortung zu finden");
      console.error(`(getLatitude/getLongitude in 0 von ${bins} .bin), Fake-Spur in ${fake}.`);
      console.error("Genau so ging 1.0.11 am 18.09. in den Store — s. Kopf dieses Skripts.");
      rmSync(dist, { recursive: true, force: true });
      console.error(`geloescht: ${dist}`);
      return false;
    }
    console.log(`Nachpruefung: echter GPS-Pfad in ${echt} von ${bins} kompilierten Dateien` +
                (fake ? `, Fake-Zweig zusaetzlich in ${fake}` : "") + " — in Ordnung.");
    return true;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** app.json und APP_VERSION muessen dieselbe Nummer tragen. */
function versionPruefen() {
  const app = JSON.parse(readFileSync(join(WURZEL, "app.json"), "utf8"));
  const inJson = app?.app?.version?.name;
  const inCode = (readFileSync(QUELLE, "utf8").match(/^const APP_VERSION = "([^"]+)";/m) || [])[1];
  if (inJson !== inCode) {
    console.error(`\nABBRUCH: app.json sagt ${inJson}, APP_VERSION sagt ${inCode}.`);
    console.error("Die Uhr zeigt und MELDET die Konstante — beide Stellen beim Bump aendern.");
    return false;
  }
  console.log(`Version: ${inJson} an beiden Stellen.`);
  return true;
}

const modus = process.argv[2];
if (!["dev", "dev-echt", "build", "pruefe"].includes(modus)) {
  console.error("Aufruf: node zepp.mjs dev | dev-echt | build | pruefe");
  console.error("  dev      Simulator, DEV_FAKE_GPS = true  (Screenshots)");
  console.error("  dev-echt Simulator, DEV_FAKE_GPS = false (echter Ortungs-Pfad, s. Testplan)");
  console.error("  build    Store-Paket, DEV_FAKE_GPS = false, mit Nachpruefung");
  console.error("  pruefe   nur das schon gebaute dist/*.zab nachpruefen");
  process.exit(2);
}

if (modus === "pruefe") process.exit(paketPruefen() ? 0 : 1);

if (modus === "dev" || modus === "dev-echt") {
  // Kein Aufraeumen noetig: `devflags.js` ist gitignoriert und wird beim naechsten `npm run build`
  // ohnehin ueberschrieben. Im VERSIONIERTEN Code steht nie ein `true`.
  const fake = modus === "dev";
  schalter(fake);
  if (!fake) {
    console.log("dev-echt: die Uhr liest die ECHTE Ortung des Simulators. Liefert der keine,");
    console.log("          bleibt die Anzeige auf \"GPS suche…\" — das ist dann der Befund.");
  }
  const r = spawnSync("zeus", ["dev"], { stdio: "inherit", cwd: WURZEL });
  process.exit(r.status ?? 1);
}

// --- build ---
// Die Version wird VOR dem Setzen geprueft, damit ein Abbruch die Datei unveraendert laesst.
if (!versionPruefen()) process.exit(1);
schalter(false);
const r = spawnSync("zeus", ["build"], { stdio: "inherit", cwd: WURZEL });
if (r.status !== 0) process.exit(r.status ?? 1);
if (!paketPruefen()) process.exit(1);
console.log("\nStore-Paket gebaut und nachgeprueft.");
