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
// Jans Vorgabe: „das soll nur automatisch bei zeus dev aber NIE bei zeus build aktiviert sein."
// Genau das macht dieses Skript — es SETZT den Wert vor jedem Lauf, statt ihn zu pruefen:
//
//     npm run dev     ->  DEV_FAKE_GPS = true   ->  zeus dev     (Simulator, Screenshots)
//     npm run build   ->  DEV_FAKE_GPS = false  ->  zeus build   (Store-Paket)
//
// Damit ist egal, was gerade in der Datei steht oder was jemand vergessen hat zurueckzustellen.
// Nach dem Bauen wird das ERGEBNIS geprueft, nicht die Eingabe: enthaelt das Paket die Fake-Spur,
// ohne den echten GPS-Pfad zu enthalten, bricht das Skript ab UND loescht die Ausgabe — ein
// Paket, das man nicht mehr hochladen kann, ist die einzige Sicherung, die wirklich haelt.
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = dirname(fileURLToPath(import.meta.url));
const QUELLE = join(WURZEL, "page", "index.js");
const ZEILE = /^const DEV_FAKE_GPS = (true|false);/m;

function schalter(wert) {
  const txt = readFileSync(QUELLE, "utf8");
  const treffer = txt.match(ZEILE);
  if (!treffer) {
    console.error(`ABBRUCH: in ${QUELLE} steht keine Zeile "const DEV_FAKE_GPS = …;".`);
    console.error("Wurde sie umbenannt? Dann gehoert dieses Skript mit angepasst.");
    process.exit(1);
  }
  if (treffer[1] === String(wert)) return treffer[1];
  writeFileSync(QUELLE, txt.replace(ZEILE, `const DEV_FAKE_GPS = ${wert};`), "utf8");
  console.log(`DEV_FAKE_GPS: ${treffer[1]} -> ${wert}`);
  return treffer[1];
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
 *  BINAER suchen, nicht als Text: `zeus build` uebersetzt `page/index.js` nach `page/index.bin`,
 *  und das liegt im .zab noch zweimal verpackt (zab -> zpk -> device.zip). Die Bezeichner stehen
 *  dort aber weiterhin in der Zeichentabelle — am zurueckgezogenen Paket vom 18.09. nachgemessen:
 *  `_flat`/`_flon` waren drin, `getLatitude`/`getLongitude`/`getStatus` NICHT. Der Bundler wirft
 *  bei `const DEV_FAKE_GPS = true` den echten Zweig komplett weg. Genau daran ist es erkennbar.
 */
function paketPruefen() {
  const ziele = ["dist", "build"].map((d) => join(WURZEL, d));
  const alle = ziele.flatMap((z) => dateien(z));
  if (!alle.length) {
    console.warn("Hinweis: kein dist/ oder build/ gefunden — Nachpruefung uebersprungen.");
    return true;
  }
  const hat = (buf, wort) => buf.includes(Buffer.from(wort, "latin1"));
  let echt = 0, fake = 0;
  for (const f of alle) {
    let buf;
    try { buf = readFileSync(f); } catch { continue; }
    // Ein .zab/.zpk ist ein ZIP (Methode "store" bei den inneren Dateien) — die Bezeichner sind
    // darin unkomprimiert zu finden, deshalb genuegt die Suche im rohen Puffer.
    if (hat(buf, "getLatitude") || hat(buf, "getLongitude")) echt++;
    if (hat(buf, "_flat") && hat(buf, "_flon")) fake++;
  }
  if (echt === 0) {
    console.error("\nABBRUCH: im gebauten Paket ist KEIN Aufruf der echten Ortung zu finden");
    console.error(`(getLatitude/getLongitude), dafuer die synthetische Spur in ${fake} Datei(en).`);
    console.error("Genau so ging 1.0.11 am 18.09. in den Store — s. Kopf dieses Skripts.");
    for (const z of ziele) if (existsSync(z)) { rmSync(z, { recursive: true, force: true }); console.error(`geloescht: ${z}`); }
    return false;
  }
  console.log(`Nachpruefung: echter GPS-Pfad in ${echt} Datei(en) — in Ordnung.`);
  return true;
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
if (modus !== "dev" && modus !== "build") {
  console.error("Aufruf: node zepp.mjs dev | build   (oder npm run dev / npm run build)");
  process.exit(2);
}

if (modus === "dev") {
  schalter(true);
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
