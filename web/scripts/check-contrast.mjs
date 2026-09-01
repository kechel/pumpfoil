// Light-Mode-Wächter. Läuft automatisch vor jedem `npm run build` (prebuild) und BRICHT AB, wenn
// das wiederkehrende Kontrast-Muster auftaucht. Grund: dieser Fehler ist mehrfach bis zu Jan
// durchgerutscht ("die 3mioste erinnerung") — er lässt sich mechanisch erkennen, also soll ihn eine
// Maschine finden und nicht ein Mensch im fertigen Produkt.
//
// Die Falle, um die es geht: Tailwind läuft hier mit darkMode = html:not(.theme-light), Dark ist also
// der DEFAULT. Zusätzlich remappt web/src/index.css die komplette slate-Skala per CSS-Variablen —
// im Light Mode ist die Rampe INVERTIERT (300 wird dunkel, 900 wird hell). Folge:
//
//   FALSCH:  text-slate-700 dark:text-slate-300   -> im Light Mode wird die 700er-Basis zu HELL,
//                                                    also hell auf hell = unlesbar (doppelt gekippt)
//   RICHTIG: text-slate-300                       -> kippt selbst korrekt in beide Modi
//
// Nur slate kippt automatisch. Alle anderen Farben (amber/emerald/red/cyan/…) brauchen weiterhin
// explizit beide Modi: `text-amber-700 dark:text-amber-300`. Das prüft dieser Wächter als WARNUNG,
// weil es dort auf den Grund ankommt und Fehlalarme möglich sind.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const CLASS_RE = /className=(?:"([^"]*)"|\{`([^`]*)`\})/g;
const PROPS = ["text", "bg", "border", "ring", "divide", "from", "to", "via"];
const NON_SLATE = /^(?:text|bg|border)-(amber|red|rose|orange|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|yellow|lime)-(\d{3})(?:\/\d+)?$/;

function walk(dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") || p.endsWith(".ts") ? [p] : [];
  });
}

const errors = [];
const warnings = [];
for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  const lineOf = (i) => text.slice(0, i).split("\n").length;
  for (const m of text.matchAll(CLASS_RE)) {
    const cls = (m[1] ?? m[2] ?? "").split(/\s+/).filter(Boolean);
    const rel = file.slice(SRC.length);
    for (const prop of PROPS) {
      const base = cls.filter((t) => new RegExp(`^${prop}-slate-\\d+(/\\d+)?$`).test(t));
      const dark = cls.filter((t) => new RegExp(`^dark:${prop}-slate-\\d+(/\\d+)?$`).test(t));
      if (base.length && dark.length) {
        errors.push(`${rel}:${lineOf(m.index)}  ${base.join(" ")} + ${dark.join(" ")}`
          + `  ->  nur ${dark[0].slice(5)} schreiben (slate kippt selbst)`);
      }
    }
    // Zweite Variante derselben Falle, die dem Wächter bis 01.09. entgangen ist: die slate-Basis
    // steht mit einem dark:-Gegenstück in einer ANDEREN Farbe. Gefunden an der Notiz „Beschleunigungs-
    // daten werden hochgeladen" (`text-slate-700 dark:text-brand-200`) — Jan konnte sie im Light Mode
    // nicht lesen, und die Prüfung oben greift nicht, weil sie beide Seiten in slate erwartet.
    // Sobald ein dark:-Gegenstück existiert, IST die slate-Basis der Light-Mode-Fall — und eine hohe
    // Zahl (600+) wird dort hell (slate-700 = 203/213/225 auf hellem Grund).
    for (const prop of PROPS) {
      const basis = cls.filter((t) => new RegExp(`^${prop}-slate-\\d+(/\\d+)?$`).test(t));
      const dunkel = cls.some((t) => new RegExp(`^dark:${prop}-`).test(t));
      for (const b of basis) {
        const zahl = Number(b.replace(/\/\d+$/, "").split("-").pop());
        if (dunkel && zahl >= 600) {
          errors.push(`${rel}:${lineOf(m.index)}  ${b} + ein dark:${prop}-Gegenstück`
            + `  ->  slate kippt selbst: EINE slate-Klasse mit der Dark-Zahl (${prop}-slate-${1000 - zahl}), kein dark:`);
        }
      }
    }
    // Farbige Töne ohne Gegenstück: auf hellem Grund ist ein 300er-Ton meist unlesbar.
    for (const t of cls) {
      const hit = NON_SLATE.exec(t);
      if (hit && Number(hit[2]) <= 400 && !cls.some((x) => x.startsWith(`dark:${t.split("-")[0]}-${hit[1]}-`))) {
        warnings.push(`${file.slice(SRC.length)}:${lineOf(m.index)}  ${t}  -> Gegenstück für den hellen Grund fehlt?`);
      }
    }
  }
}

if (warnings.length) {
  console.warn(`\nLight-Mode-Wächter: ${warnings.length} Hinweis(e) — farbiger Ton ohne Gegenstück:`);
  for (const w of warnings.slice(0, 12)) console.warn("  " + w);
  if (warnings.length > 12) console.warn(`  … und ${warnings.length - 12} weitere`);
}
if (errors.length) {
  console.error(`\nLight-Mode-Wächter: ${errors.length} FEHLER — slate doppelt gekippt (im Light Mode unlesbar):`);
  for (const e of errors) console.error("  " + e);
  console.error("\nRegel: slate NUR mit der Dark-Zahl schreiben (text-slate-300), kein dark:-Gegenstück.");
  console.error("Nicht-slate (amber/emerald/…) dagegen IMMER beide: text-amber-700 dark:text-amber-300.\n");
  process.exit(1);
}
console.log(`Light-Mode-Wächter: ok (0 Fehler, ${warnings.length} Hinweise)`);
