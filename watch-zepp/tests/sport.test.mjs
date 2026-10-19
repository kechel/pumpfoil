// Sportart-Wahl der Zepp-App in Node nachgestellt — die Funktionen werden AUS DER QUELLE
// geschnitten (wie canary.test.mjs), nicht abgetippt.
//
//     node tests/sport.test.mjs
//
// Geprueft: Liste saeubern (nur id + name, hoechstens 6), Vorwahl = Standard (erster Eintrag)
// ausser einer eigenen Wahl in diesem App-Lauf, Weiterschalten mit Umlauf, und dass
// `sport_class` NUR bei echter Wahl (mehr als eine Sportart) mitgeht. Dazu der Durchgang durch
// die Whitelist im app-side START.
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../page/index.js", import.meta.url), "utf8");
function schneide(q, name) {
  const start = q.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} nicht gefunden`);
  let tiefe = 0;
  for (let j = q.indexOf("{", start); j < q.length; j++) {
    if (q[j] === "{") tiefe++;
    else if (q[j] === "}" && --tiefe === 0) return q.slice(start, j + 1);
  }
  throw new Error(`${name} nicht abgeschlossen`);
}
const namen = ["sportListe", "sportWahl", "sportNaechster", "sportKlasse"];
const S = new Function(`${namen.map((n) => schneide(quelle, n)).join("\n")}\nreturn { ${namen.join(", ")} };`)();

let fehler = 0;
const pruefe = (n, ok) => { if (!ok) fehler++; console.log(`${ok ? "  ok  " : "  FEHL"} ${n}`); };
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("1) Liste saeubern");
pruefe("kein Array -> leer", gleich(S.sportListe(undefined), []) && gleich(S.sportListe({}), []));
{
  const roh = [{ id: "wingfoil", name: "Wingfoil", extra: 1 }, null, { id: 5 }, { id: "" },
    { id: "pumpfoil" }, { id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" },
    { id: "d", name: "D" }, { id: "e", name: "E" }];
  const l = S.sportListe(roh);
  pruefe("ungueltige raus, hoechstens 6", l.length === 6);
  pruefe("nur id + name", gleich(l[0], { id: "wingfoil", name: "Wingfoil" }));
  pruefe("fehlender Name -> id", gleich(l[1], { id: "pumpfoil", name: "pumpfoil" }));
}

const L = S.sportListe([{ id: "wingfoil", name: "Wingfoil" }, { id: "pumpfoil", name: "Pumpfoil" },
  { id: "downwind", name: "Downwind" }]);

console.log("\n2) Vorwahl");
pruefe("leere Liste -> null", S.sportWahl([], "x", true) === null);
pruefe("ohne eigene Wahl: Standard", S.sportWahl(L, "pumpfoil", false) === "wingfoil");
pruefe("eigene Wahl bleibt", S.sportWahl(L, "downwind", true) === "downwind");
pruefe("eigene Wahl verschwunden -> Standard", S.sportWahl(L, "surf", true) === "wingfoil");

console.log("\n3) Weiterschalten");
pruefe("naechste", S.sportNaechster(L, "wingfoil") === "pumpfoil");
pruefe("Umlauf am Ende", S.sportNaechster(L, "downwind") === "wingfoil");
pruefe("unbekannt -> erste", S.sportNaechster(L, null) === "wingfoil");
pruefe("leer -> null", S.sportNaechster([], "x") === null);

console.log("\n4) sport_class nur bei echter Wahl");
pruefe("mehrere + gueltig", S.sportKlasse(L, "pumpfoil") === "pumpfoil");
pruefe("nur eine Sportart -> null", S.sportKlasse(L.slice(0, 1), "wingfoil") === null);
pruefe("unbekannte id -> null", S.sportKlasse(L, "surf") === null);
pruefe("keine Auswahl -> null", S.sportKlasse(L, null) === null);
pruefe("keine Liste -> null", S.sportKlasse(undefined, "x") === null);

console.log("\n5) Upload-Meta und app-side-Whitelist");
pruefe("uploadSession setzt meta.sport_class",
  /if \(sess\.sportClass\) meta\.sport_class = sess\.sportClass;/.test(quelle));
{
  const side = readFileSync(new URL("../app-side/index.js", import.meta.url), "utf8");
  pruefe("CONFIG fragt sp=1 an", side.includes("/api/devices/config?p=zepp&sp=1"));
  pruefe("CONFIG reicht sports durch", /sports: b && Array\.isArray\(b\.sports\)/.test(side));
  // Den Body-Bau des START-Zweigs nachstellen: die drei Zeilen aus der Quelle schneiden.
  const a = side.indexOf('if (req.method === "START")');
  const ende = side.indexOf("const r = await authPost", a);
  const block = side.slice(side.indexOf("const body", a), ende);
  const bau = new Function("m", "iso", block + "\nreturn body;");
  const iso = (ms) => new Date(ms).toISOString();
  const basis = { session_uuid: "u", started_at_ms: 0, sport: "pumpfoil", gps_hz: 1, accel_hz: 25, accel_scale: 1 };
  pruefe("mit sport_class -> im Body", bau(Object.assign({ sport_class: "wingfoil" }, basis), iso).sport_class === "wingfoil");
  pruefe("ohne -> fehlt im Body", !("sport_class" in bau(basis, iso)));
}

console.log(fehler ? `\n${fehler} Fehler` : "\nalles gruen");
process.exit(fehler ? 1 : 0);
