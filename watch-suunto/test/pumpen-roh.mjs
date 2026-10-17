// Laesst den Pump-Zaehler der Uhr (quelle/pumpe.js) ueber Ausschnitte laufen, fuer
// scripts/suunto-pumpen-paare.py. Eingabe (stdin): [{id, hz, scale, b64}] — int16 x,y,z;
// hochgerechnet auf 50 Hz wie die Suunto liefert. Ausgabe: {id: [Pump-Zeiten in s ab Ausschnitt]}.
import { kontext } from "./lade.mjs";
let roh = "";
process.stdin.on("data", (d) => (roh += d));
process.stdin.on("end", () => {
  const aus = {};
  for (const a of JSON.parse(roh)) {
    const b = Buffer.from(a.b64, "base64"), v = new Int16Array(b.buffer, b.byteOffset, b.length / 2);
    const n = v.length / 3, ctx = kontext(["quelle/pumpe.js"]), p = new ctx.Pumpe(50);
    const f = 50 / a.hz;   // Werte je Rohwert (25 Hz -> 2)
    for (let i = 0; i < n; i++) {
      const j = Math.min(i + 1, n - 1);
      for (let k = 0; k < f; k++) {
        const w = k / f;
        p.wert(((1 - w) * v[3 * i] + w * v[3 * j]) / a.scale, ((1 - w) * v[3 * i + 1] + w * v[3 * j + 1]) / a.scale,
          ((1 - w) * v[3 * i + 2] + w * v[3 * j + 2]) / a.scale);
      }
    }
    aus[a.id] = Array.from(p.zeiten);
  }
  process.stdout.write(JSON.stringify(aus));
});
