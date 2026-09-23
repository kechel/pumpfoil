// Die Zeitgrenze aus `reqQ` in Node nachgestellt — aus der QUELLE geschnitten, nicht abgetippt.
//
//     node tests/reqq.test.mjs
//
// WOZU: `@zeppos/zml/base-page` hat keine eigene Zeitgrenze (in `dist/zml-page.js` kommt das
// Wort `timeout` nicht vor). Antwortet die Handy-Seite nicht, bleibt die Promise fuer immer
// offen, und jeder Fehlerpfad daran ist toter Code — im Emulator am 23.09.2026 belegt. Diese
// Grenze bauen wir deshalb selbst, und sie muss zwei Dinge koennen: rechtzeitig abbrechen UND
// die Warteschlange wieder freigeben.
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../page/index.js", import.meta.url), "utf8");
const start = quelle.indexOf("    reqQ(payload, opts) {");
if (start < 0) throw new Error("reqQ nicht gefunden");
let tiefe = 0, ende = -1;
for (let j = quelle.indexOf("{", start); j < quelle.length; j++) {
  if (quelle[j] === "{") tiefe++;
  else if (quelle[j] === "}" && --tiefe === 0) { ende = j + 1; break; }
}
const koerper = quelle.slice(start, ende).replace(/^\s*reqQ\(payload, opts\)\s*\{/, "").replace(/\}$/, "");
const reqQ = new Function("payload", "opts", koerper);

let fehler = 0;
const pruefe = (name, ok) => { if (!ok) fehler++; console.log(`${ok ? "  ok  " : "  FEHL"} ${name}`); };

// Ein Objekt, das sich wie die Seite verhaelt: `request` antwortet nie, immer, oder mit Fehler.
function seite(verhalten) {
  return { _chain: null, request: verhalten, reqQ };
}

const nie = () => new Promise(() => {});          // genau der Fall aus dem Emulator
const sofort = (v) => () => Promise.resolve(v);

console.log("1) Ohne Zeitgrenze bleibt es offen (Verhalten wie bisher, bewusst)");
{
  const s = seite(nie);
  let fertig = false;
  s.reqQ({}).then(() => { fertig = true; }, () => { fertig = true; });
  await new Promise((r) => setTimeout(r, 60));
  pruefe("nach 60 ms weder erfuellt noch abgelehnt", fertig === false);
}

console.log("\n2) MIT Zeitgrenze bricht es ab — der Fall, der heute fehlte");
{
  const s = seite(nie);
  const t0 = Date.now();
  let grund = null;
  await s.reqQ({}, { timeout: 80 }).catch((e) => { grund = e && e.message; });
  const dt = Date.now() - t0;
  pruefe(`abgelehnt nach ${dt} ms`, grund === "timeout");
  pruefe("nicht wesentlich frueher oder spaeter", dt >= 70 && dt < 400);
}

console.log("\n3) Die Warteschlange ist danach WIEDER FREI");
{
  const s = seite(nie);
  await s.reqQ({}, { timeout: 60 }).catch(() => {});
  s.request = sofort({ ok: true });
  const r = await Promise.race([s.reqQ({ zweiter: true }),
                                new Promise((_, b) => setTimeout(() => b(new Error("blockiert")), 500))]);
  pruefe("zweiter Request kommt durch", r && r.ok === true);
}

console.log("\n4) Eine schnelle Antwort wartet die Grenze nicht ab");
{
  const s = seite(sofort({ code: "ABC123" }));
  const t0 = Date.now();
  const r = await s.reqQ({}, { timeout: 5000 });
  pruefe(`Antwort nach ${Date.now() - t0} ms, Inhalt unveraendert`,
         r.code === "ABC123" && Date.now() - t0 < 200);
}

console.log("\n5) Ein echter Fehler bleibt ein echter Fehler");
{
  const s = seite(() => Promise.reject(new Error("shake timeout")));
  let grund = null;
  await s.reqQ({}, { timeout: 5000 }).catch((e) => { grund = e.message; });
  pruefe("Grund durchgereicht, nicht durch 'timeout' ersetzt", grund === "shake timeout");
}

console.log(fehler ? `\n${fehler} FEHLER` : "\nalle Faelle gruen");
process.exit(fehler ? 1 : 0);
