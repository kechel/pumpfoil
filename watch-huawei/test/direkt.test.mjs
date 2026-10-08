// Direkt-Upload der Watch 3/4 (common/direkt.js): der ECHTE Code in Node, Dateien und Netz als Attrappen
// (test/e2e/mock), ein Server in einfach. Gleiche Dateien wie im Ende-zu-Ende-Test der Uhr. Geprueft wird,
// was beim Server ankommt: Koppeln, Konfiguration, jeder Chunk genau einmal, GPS zuerst, /complete zuletzt,
// erst danach geloescht — und dass ein abgebrochener Upload ohne Doppelte weitergeht und 401 entkoppelt.
// Gegenstueck fuer die Watch 5: Kern.ets direktBereit/direktUpload (arkts-kern.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";

register("./e2e/hook.mjs", import.meta.url);
const { uhr } = await import("./e2e/mock/uhr.mjs");
const { setzeServer } = await import("./e2e/mock/fetch.mjs");
const K = (await import("../common/kern.js")).default;
const D = (await import("../common/direkt.js")).default;

const DATEIEN = JSON.parse(fs.readFileSync(new URL("./fixtures/huawei-e2e-dateien.json", import.meta.url), "utf8"));
const PFAD = "internal://app/";
const TX = { connect: "Verbinden", connected: "Verbunden", disconnect: "Trennen", pairHint: "Konto", pairNoNet: "kein Netz", allSent: "Alles da" };

async function bis(bedingung, was) {
  for (let i = 0; i < 20000; i++) {
    if (bedingung()) return;
    await new Promise((r) => setImmediate(r));
  }
  assert.fail("wartet vergeblich auf: " + was);
}

/** Uhr mit einer abgeschlossenen Session (die Dateien aus dem E2E-Test), noch nichts gesendet. */
function uhrMitSession() {
  uhr.dateien.clear();
  for (const [name, text] of Object.entries(DATEIEN)) uhr.dateien.set(PFAD + name, text);
  const id = JSON.parse(Object.entries(DATEIEN).find(([k]) => k.startsWith("m_"))[1]).session_uuid;
  const n = Object.keys(DATEIEN).filter((k) => k.startsWith("c_")).length;
  const plan = new K.Sendeplan();
  plan.neu(id);
  for (let i = 0; i < n; i++) plan.chunk(id);
  plan.ende(id);
  const R = { plan, modell: "HUAWEI Watch 3 · HarmonyOS", verworfen: 0, konfig: null,
    konfigAnwenden(k) { this.konfig = k; }, infoZeile() { return "alt"; } };
  return { R, id, n };
}

/** Server in einfach: Koppeln, Konfiguration, Ingest. Haelt fest, was ankam. */
function server(opt = {}) {
  const s = { aufrufe: [], chunks: [], eingeloest: false, token: "tok-123", complete: 0, abbruchNach: opt.abbruchNach ?? -1, schonDa: new Set() };
  setzeServer((o) => {
    const pfad = o.url.replace(D.SERVER, "");
    s.aufrufe.push(o.method + " " + pfad.split("?")[0]);
    if (o.header && o.header["X-Device-Token"] && o.header["X-Device-Token"] !== s.token) return { code: 401, data: "nope" };
    if (pfad === "/api/devices/pair-init") return { code: 200, data: JSON.stringify({ code: "AB12CD", claim_token: "claim-1" }) };
    if (pfad.startsWith("/api/devices/pair-poll")) return { code: 200, data: JSON.stringify({ device_token: s.eingeloest ? s.token : null }) };
    if (pfad.startsWith("/api/devices/config")) return { code: 200, data: JSON.stringify({ views: [[1, 3, 4]], layoutsOn: false }) };
    if (pfad === "/api/ingest/session") {
      s.meta = JSON.parse(o.data);
      return { code: 200, data: JSON.stringify({ received_chunks: [...s.schonDa] }) };
    }
    if (pfad.endsWith("/chunks")) {
      if (s.abbruchNach === 0) { s.abbruchNach = -1; return { code: 0, data: "Netz weg" }; }
      if (s.abbruchNach > 0) s.abbruchNach--;
      const c = JSON.parse(o.data).chunks;
      for (const x of c) { s.chunks.push(x); s.schonDa.add(x.index); }
      return { code: 200, data: JSON.stringify({ received: c.map((x) => x.index) }) };
    }
    if (pfad.endsWith("/complete")) { s.complete++; s.ende = JSON.parse(o.data); return { code: 200, data: "{}" }; }
    return { code: 404, data: "?" };
  });
  return s;
}

test("Watch 3/4 direkt: koppeln per Code, Konfiguration holen, Session vollstaendig hochladen, dann loeschen", async () => {
  const { R, id, n } = uhrMitSession();
  const s = server();
  const d = D.an(R);
  clearInterval(d.uhr);   // der Test taktet selbst
  try {
    await bis(() => true, "Start");
    assert.equal(d.text(TX), "Verbinden");
    d.tippen();
    await bis(() => d.koppeln && d.koppeln.code, "Code");
    assert.equal(d.text(TX), "AB12CD · Konto");
    d.koppelnZuletzt = 0; d.koppelnTakt();
    await bis(() => !d.koppelnLaeuft, "Poll");
    assert.equal(d.token, "", "noch nicht eingeloest");
    s.eingeloest = true;
    d.koppelnZuletzt = 0; d.koppelnTakt();
    await bis(() => d.token === "tok-123", "Token");
    assert.equal(R.direktAn, true, "Wear Engine still");
    assert.equal(JSON.parse(uhr.dateien.get(PFAD + "direkt.json")).t, "tok-123");
    assert.equal(d.text(TX), "Verbunden");

    d.takt();                                        // erst die Konfiguration
    await bis(() => R.konfig !== null && !d.laeuft, "Konfiguration");
    assert.ok(uhr.dateien.has(PFAD + "konfig.json"));
    d.takt();                                        // dann die Session
    await bis(() => s.complete === 1 && !d.laeuft, "Upload");

    assert.equal(s.meta.session_uuid, id);
    assert.equal(s.meta.expected_chunks, n);
    assert.deepEqual(s.chunks.map((c) => c.index).sort((a, b) => a - b), [...Array(n).keys()], "jeder Chunk genau einmal");
    const erst = s.chunks.findIndex((c) => c.kind !== "gps");
    assert.ok(s.chunks.slice(0, erst).every((c) => c.kind === "gps") && s.chunks.slice(erst).every((c) => c.kind !== "gps"), "GPS zuerst");
    assert.equal(s.aufrufe.at(-1), "POST /api/ingest/session/" + id + "/complete", "complete zuletzt");
    assert.equal(s.ende.total_chunks, n);
    assert.equal([...uhr.dateien.keys()].filter((k) => k.includes(id)).length, 0, "Dateien erst nach complete geloescht");
    assert.equal(R.plan.s.length, 0);
    assert.deepEqual(JSON.parse(uhr.dateien.get(PFAD + "plan.json")).s, []);
    // Infozeile: gekoppelt kein „App am Handy oeffnen"
    assert.equal(R.infoZeile({ modus: "bereit", fehler: 0, offen: 0, plan: { fertig: 0, gesamt: 0 }, gpsOk: true }, TX), "Alles da");
  } finally { clearInterval(d.uhr); }
});

test("Watch 3/4 direkt: Netz bricht mitten im Upload ab -> Backoff, zweiter Versuch ohne Doppelte; 401 entkoppelt", async () => {
  const { R, id, n } = uhrMitSession();
  const s = server({ abbruchNach: 1 });           // erstes Paket geht durch, beim zweiten ist das Netz weg
  uhr.dateien.set(PFAD + "direkt.json", JSON.stringify({ t: "tok-123" }));
  const d = D.an(R);
  clearInterval(d.uhr);
  try {
    await bis(() => d.token === "tok-123", "Token aus Datei");
    d.konfigZuletzt = Date.now();                  // Konfiguration ist hier nicht Thema
    d.takt();
    await bis(() => d.fehler === 1 && !d.laeuft, "Abbruch");
    assert.ok(d.naechster > Date.now() + 20000, "Backoff 30 s");
    assert.equal(s.complete, 0);
    assert.ok(uhr.dateien.has(PFAD + "m_" + id + ".json"), "nichts geloescht");
    d.naechster = 0; d.takt();
    await bis(() => s.complete === 1 && !d.laeuft, "zweiter Versuch");
    assert.deepEqual(s.chunks.map((c) => c.index).sort((a, b) => a - b), [...Array(n).keys()], "keine Doppelten, nichts fehlt");
    assert.equal(d.fehler, 0);

    // Geraet auf pumpfoil.org entfernt: 401 -> entkoppelt, Wear Engine wieder an
    const zweite = uhrMitSession();
    for (const e of zweite.R.plan.s) R.plan.s.push(e);
    s.token = "anderes";
    d.takt();
    await bis(() => d.token === "" && !d.laeuft, "401");
    assert.equal(R.direktAn, false);
    assert.ok(!uhr.dateien.has(PFAD + "direkt.json"));
    assert.equal(R.plan.s.length, 1, "Session bleibt fuer die Wear Engine liegen");
  } finally { clearInterval(d.uhr); }
});

test("Watch 3/4 direkt: Pakete wie Watch 5 und Android-Bruecke (Meta, GPS zuerst, <= 30)", () => {
  const meta = Object.entries(DATEIEN).find(([k]) => k.startsWith("m_"))[1];
  const chunks = Object.entries(DATEIEN).filter(([k]) => k.startsWith("c_")).sort().map(([, v]) => v);
  const up = D.upload(meta, chunks, [], 30);
  assert.equal(JSON.parse(up.meta).expected_chunks, chunks.length);
  assert.ok(up.pakete.every((p) => JSON.parse(p).chunks.length <= 30));
  assert.equal(up.pakete.flatMap((p) => JSON.parse(p).chunks).length, chunks.length);
});

test("Watch 3/4 direkt: gekoppelt liefert der Sendeplan der Wear Engine nichts, getrennt wieder alles", async () => {
  const { R } = uhrMitSession();
  setzeServer(() => ({ code: 0, data: "aus" }));
  uhr.dateien.set(PFAD + "direkt.json", JSON.stringify({ t: "tok-1" }));
  const d = D.an(R);
  clearInterval(d.uhr);
  await bis(() => d.token === "tok-1", "Token");
  assert.equal(R.plan.naechste(), null, "Wear Engine still");
  d.trennen();
  assert.equal(R.plan.naechste().art, "m", "getrennt: Wear Engine schickt wieder");
});
