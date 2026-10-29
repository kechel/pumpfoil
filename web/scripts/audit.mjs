// npm audit fuer die ausgelieferten Pakete (ohne Build-Werkzeuge), mit bewusst akzeptierten Ausnahmen.
// Aufgerufen von .github/workflows/audit.yml; lokal: `node scripts/audit.mjs`. Exit 1 bei neuen Befunden.
//
// npm kennt keine Ausnahmeliste. Ohne sie waere die woechentliche Pruefung wegen eines Befunds, den wir
// anders geloest haben, dauerhaft rot — und ein dauerhaft roter Lauf wird nicht mehr gelesen.
// JEDE AUSNAHME BRAUCHT EINEN GRUND. Faellt der Grund weg (z. B. Upgrade auf react-router 7), raus damit.
import { execSync } from "node:child_process";

const AUSNAHMEN = {
  // Offene Weiterleitung per Backslash in <Link>/useNavigate. Der einzige Weg mit fremdem Ziel ist
  // Login `?next=` — dort sind Backslashes seit 29.10.2026 verboten (src/pages/Login.tsx). Behoben erst
  // in react-router 7 (Major-Upgrade).
  "GHSA-wrjc-x8rr-h8h6": "Login prueft Backslash selbst",
  // Betrifft nur Server-Side-Rendering (Hydration von Fehlern); die PWA rendert ausschliesslich im Browser.
  "GHSA-337j-9hxr-rhxg": "kein SSR",
};

let roh;
try {
  roh = execSync("npm audit --omit=dev --json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch (e) {
  roh = e.stdout;          // npm audit endet mit 1, sobald es irgendetwas findet
}
const bericht = JSON.parse(roh || "{}");
const neu = [];
for (const [paket, v] of Object.entries(bericht.vulnerabilities || {})) {
  for (const via of v.via || []) {
    if (typeof via !== "object") continue;               // nur ein Verweis auf ein anderes Paket
    const id = (via.url || "").split("/").pop();
    if (!["moderate", "high", "critical"].includes(via.severity)) continue;
    if (AUSNAHMEN[id]) {
      console.log(`akzeptiert: ${paket} ${id} (${AUSNAHMEN[id]})`);
      continue;
    }
    neu.push(`${paket} ${via.severity}: ${via.title} ${via.url}`);
  }
}
if (neu.length) {
  console.log([...new Set(neu)].join("\n"));
  process.exit(1);
}
console.log("Keine neuen Befunde.");
