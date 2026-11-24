// Sammel-Upload (24.11.2026) — `uploadSession` aus der QUELLE geschnitten, gegen einen Schein-Server.
//
//     node tests/sammelupload.test.mjs
//
// Mehrere Chunks je Anfrage (CHUNKS), gleiche Indizes und Inhalte wie der Einzelweg, Resume ab Wasserstand,
// Wasserstand an 25er-Grenzen, Abbruch bei Fehler ohne Wasserstand hinter dem letzten quittierten Block.
import { readFileSync } from "node:fs";

const quelle = readFileSync(new URL("../page/index.js", import.meta.url), "utf8");
function schneide(name) {
  const m = new RegExp(`\\n    ${name}\\([^)]*\\) \\{`).exec(quelle);
  if (!m) throw new Error(name + " nicht gefunden");
  const start = m.index + 1;
  let tiefe = 0;
  for (let j = quelle.indexOf("{", start); j < quelle.length; j++) {
    if (quelle[j] === "{") tiefe++;
    else if (quelle[j] === "}" && --tiefe === 0) return quelle.slice(start, j + 1);
  }
  throw new Error(name + " nicht abgeschlossen");
}
const zeile = (re) => { const m = new RegExp(re, "m").exec(quelle); if (!m) throw new Error(re); return m[0]; };
const block = (anfang) => {   // const x = (...) => { ... };
  const i = quelle.indexOf(anfang); if (i < 0) throw new Error(anfang);
  let tiefe = 0;
  for (let j = quelle.indexOf("{", i); j < quelle.length; j++) {
    if (quelle[j] === "{") tiefe++;
    else if (quelle[j] === "}" && --tiefe === 0) return quelle.slice(i, quelle.indexOf(";", j) + 1);
  }
};
const vorspann = [
  zeile("^const GPS_HZ = [^\\n]*$"), zeile("^const GPS_CHUNK = [^\\n]*$"), zeile("^const ACCEL_CHUNK_SAMPLES = [^\\n]*$"),
  zeile("^const UPLOAD_BATCH_DEFAULT = [^\\n]*$"), block("const uploadBatch = "), zeile("^const GPS_REC_BYTES = [^\\n]*$"),
  zeile("^const APP_VERSION = [^\\n]*$"), zeile("^const markeKey = [^\\n]*$"), block("const ladeMarke = "),
  zeile("^const setzeMarke = [^\\n]*$"), block("const bytesToGps = "), block("const bytesToBase64 = "),
].join("\n");

function baue({ batch, gps = 35, accel = 53, marke = null, fehlerBei = -1 }) {
  const mem = new Map();
  const store = { getItem: (k, d) => (mem.has(k) ? mem.get(k) : d), setItem: (k, v) => mem.set(k, String(v)) };
  if (batch != null) store.setItem("uploadBatch", String(batch));
  const dateien = {
    "g": new Uint8Array(gps * 10 * 18).map((_, i) => (i * 7) & 255),
    "a": new Uint8Array(accel * 128 * 6).map((_, i) => (i * 13) & 255),
  };
  const fs = {
    O_RDONLY: 0,
    openSync: ({ path }) => path,
    closeSync: () => {},
    readSync: ({ fd, buffer, options }) => {
      const src = dateien[fd].subarray(options.position, options.position + options.length);
      new Uint8Array(buffer).set(src); return src.length;
    },
  };
  const anfragen = [];
  const uhr = new Function("store", "fs", "t", "getTok", `
    const { O_RDONLY, openSync, closeSync, readSync } = fs;
    ${vorspann}
    return { state: {}, ${schneide("uploadSession")} };`)(store, fs, (x) => x, () => "tok");
  let n = 0;
  uhr.reqQ = (p) => {
    anfragen.push(JSON.parse(JSON.stringify(p)));
    if (n++ === fehlerBei) return Promise.resolve({ error: "kaputt" });
    return Promise.resolve({ ok: true });
  };
  if (marke) store.setItem("sent:u1", marke);
  const sess = { uuid: "u1", startedAtMs: 1, endedAtMs: 2, gpsFile: "g", gpsCount: gps * 10 - 3,
    accelFile: "a", accelSamples: accel * 128 - 40, accelHz: 100, accelChunkT0: [] };
  return { uhr, sess, anfragen, store };
}
const chunksVon = (anfragen) => anfragen.flatMap((p) => p.method === "CHUNKS" ? p.chunks
  : p.method === "CHUNK" ? [{ index: p.index, kind: p.kind, encoding: p.encoding, t0_ms: p.t0_ms, count: p.count, data: p.data }] : []);

let fehler = 0;
const pruefe = (ok, text) => { if (!ok) { fehler++; console.log("FEHLER:", text); } else console.log("ok:", text); };

// 1) Einzelweg (batch 1) vs. Sammelweg (10): gleiche Chunks
const einzel = baue({ batch: 1 }); await einzel.uhr.uploadSession(einzel.sess);
const sammel = baue({ batch: 10 }); await sammel.uhr.uploadSession(sammel.sess);
const ce = chunksVon(einzel.anfragen), cs = chunksVon(sammel.anfragen);
pruefe(ce.length === 35 + 53 && JSON.stringify(ce) === JSON.stringify(cs), "Sammelweg liefert genau dieselben Chunks wie der Einzelweg");
const nE = einzel.anfragen.length, nS = sammel.anfragen.length;
pruefe(nE === 2 + 88 && nS === 2 + 4 + 6, `Anfragen: einzeln ${nE}, gesammelt ${nS} (START + 4 GPS + 6 Accel + COMPLETE)`);
pruefe(sammel.anfragen.every((p) => p.method !== "CHUNKS" || p.chunks.length <= 10), "hoechstens 10 Chunks je Anfrage");
pruefe(sammel.store.getItem("sent:u1") === "35/53", "Wasserstand am Ende 35/53 (" + sammel.store.getItem("sent:u1") + ")");

// 2) Standard ohne Server-Wert = 10
const std = baue({}); await std.uhr.uploadSession(std.sess);
pruefe(std.anfragen.filter((p) => p.method === "CHUNKS").every((p) => p.chunks.length <= 10) && std.anfragen.length === 12, "ohne Server-Wert: 10 je Anfrage");

// 3) Resume ab Wasserstand 35/27: nur Accel 27..52
const res = baue({ batch: 10, marke: "35/27" }); await res.uhr.uploadSession(res.sess);
const cr = chunksVon(res.anfragen);
pruefe(cr.length === 26 && cr[0].kind === "accel" && cr[0].index === 27 && cr[25].index === 52, "Resume: nur Accel 27-52");

// 4) Fehler in der 3. Anfrage (GPS 10-19): Abbruch, Wasserstand bleibt hinter dem Quittierten
const kap = baue({ batch: 10, fehlerBei: 2 });
let geworfen = false;
try { await kap.uhr.uploadSession(kap.sess); } catch (e) { geworfen = true; }
const m = kap.store.getItem("sent:u1", "0/0");
pruefe(geworfen && kap.anfragen.length === 3, "Fehler -> Upload bricht ab, keine weitere Anfrage");
pruefe(m === "0/0" || Number(m.split("/")[0]) <= 10, "Wasserstand nicht hinter dem letzten quittierten Block (" + m + ")");

// 5) Wasserstand an 25er-Grenze: nach GPS 20-29 (ueberschreitet 25) steht 30
const gr = baue({ batch: 10, fehlerBei: 4 });   // START, GPS0-9, 10-19, 20-29, [GPS30-34 schlaegt fehl]
try { await gr.uhr.uploadSession(gr.sess); } catch (e) {}
pruefe(gr.store.getItem("sent:u1") === "30/0", "Wasserstand an der 25er-Grenze: 30/0 (" + gr.store.getItem("sent:u1") + ")");

console.log(fehler ? `\n${fehler} FEHLER` : "\nalles ok");
process.exit(fehler ? 1 : 0);
