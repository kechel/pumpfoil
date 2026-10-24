// Gehashte Build-Dateien aufbewahren (24.10.2026). Vite leert bei jedem Build `dist/`; eine noch offene alte
// Seite oder eine alte Huelle im PWA-Cache fand ihre Dateien danach nicht mehr -> weisse Seite (Jans PWA).
// Laeuft als prebuild (sichert die gerade LIVE liegenden Dateien, bevor Vite sie loescht) und als postbuild
// (die neuen). Der Server liefert aus `web/assets-archiv/`, was in `dist/assets/` fehlt (server/app/main.py).
//
// Aufraeumen: Dateien, die seit ARCHIV_TAGE im Archiv liegen und nicht mehr im aktuellen Build stecken, gehen
// weg. Massgeblich ist der Zeitpunkt der Aufnahme ins Archiv (mtime der Kopie), nicht der des Builds.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const ARCHIV_TAGE = 30;
const DIST = new URL("../dist/assets/", import.meta.url).pathname;
const ARCHIV = new URL("../assets-archiv/", import.meta.url).pathname;

mkdirSync(ARCHIV, { recursive: true });
const aktuell = existsSync(DIST) ? readdirSync(DIST) : [];
let neu = 0;
for (const f of aktuell) {
  const ziel = join(ARCHIV, f);
  if (!existsSync(ziel)) { copyFileSync(join(DIST, f), ziel); neu++; }
}
const grenze = Date.now() - ARCHIV_TAGE * 86400 * 1000;
const imBuild = new Set(aktuell);
let weg = 0;
for (const f of readdirSync(ARCHIV)) {
  const p = join(ARCHIV, f);
  if (!imBuild.has(f) && statSync(p).mtimeMs < grenze) { unlinkSync(p); weg++; }
}
console.log(`assets-archiv: ${neu} neu, ${weg} nach ${ARCHIV_TAGE} Tagen entfernt, ${readdirSync(ARCHIV).length} im Archiv`);
