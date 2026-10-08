/*
 * Direkt zum Server, ohne Handy — Watch 3/4 (JS-FA, HarmonyOS 2-4). Gegenstueck zu arkts/…/Direkt.ets
 * + Recorder.ets (Watch 5): gleicher Ablauf, gleiche Pfade, gleiche Koerper (Jan, 08.10.2026: „dann
 * gehts ohne app und auch fuer leute mit iphone"; „was ist mit der middle class?").
 *
 * NUR die Watch-3/4-Fassung bindet das ein (common/app-wearable.js). Lite hat kein Netz, und sein
 * app.js-Buendel liegt an der Grenze der Snapshot-Uebersetzung — dort steht davon nichts.
 *
 * Koppeln wie Garmin: /api/devices/pair-init (Plattform huawei) -> Code auf der Uhr -> Nutzer gibt
 * ihn auf pumpfoil.org (Konto) ein -> /pair-poll liefert das Geraete-Token (internal://app/direkt.json).
 * Gekoppelt: R.direktAn haelt die Wear Engine still (recorder.js senden), Konfiguration kommt
 * halbstuendlich von /api/devices/config, jede ABGESCHLOSSENE, per Wear Engine unberuehrte Session geht
 * wie bei der Android-Bruecke hoch (Meta mit expected_chunks, GPS-Chunks zuerst in Paketen zu 30,
 * jede Quittung geprueft, /complete, erst dann loeschen). Backoff 30 s … 5 min, jeder Fehlversuch
 * geloggt; 401 -> entkoppelt.
 *
 * UNGEPRUEFT auf echter Uhr: ob @system.fetch auf Watch 3/4 fuer Dritt-Apps ins Netz darf (WLAN/eSIM)
 * — einen Simulator fuer diese Linie gibt es nicht. Getestet in Node: test/direkt.test.mjs.
 */
import fetch from "@system.fetch";
import file from "@system.file";
import K from "./kern.js";
import S from "./lauf.js";
import C from "./konfig.js";

var SERVER = "https://pumpfoil.org";
var DATEI = "internal://app/direkt.json";
var PLAN = "internal://app/plan.json";
var KONFIG = "internal://app/konfig.json";
var KONFIG_ALLE_MS = 30 * 60 * 1000;
var PAKET = 30;

// Gekoppelt gehen KEINE Session-Dateien ueber die Wear Engine: recorder.js holt sie per plan.naechste().
// Hier einmal umhuellt statt in recorder.js geaendert — das Lite-app.js-Buendel hat fuer keine Zeile mehr
// Platz (der Snapshot-Bau kippte am 08.10.2026 schon an einer einzigen Pruefzeile).
var aktiv = null;   // das Direkt-Objekt dieser App (an() ruft die App genau einmal)
var naechste = K.Sendeplan.prototype.naechste;
K.Sendeplan.prototype.naechste = function () { return aktiv && aktiv.token ? null : naechste.call(this); };

function log(t) { console.info("Pumpfoil direkt " + t); }

/** Erste Session, die fertig und noch unberuehrt ist (wie Kern.ets direktBereit), sonst null. */
function bereit(plan) {
  for (var i = 0; i < plan.s.length; i++) {
    var x = plan.s[i];
    if (x.e && !x.m && x.g === 0 && !x.eg) return x;
  }
  return null;
}

/** Bodies fuer den Upload (wie Kern.ets direktUpload): Chunk-Texte unveraendert, GPS zuerst. */
function upload(metaText, chunkTexte, schonDa, groesse) {
  var t = metaText.trim();
  var meta = t.substring(0, t.length - 1) + ',"expected_chunks":' + chunkTexte.length + "}";
  var gps = [], rest = [], i;
  for (i = 0; i < chunkTexte.length; i++) {
    var k = JSON.parse(chunkTexte[i]);
    if (schonDa.indexOf(k.index) >= 0) continue;
    (k.kind === "gps" ? gps : rest).push(chunkTexte[i]);
  }
  var alle = gps.concat(rest), pakete = [];
  for (i = 0; i < alle.length; i += groesse) pakete.push('{"chunks":[' + alle.slice(i, i + groesse).join(",") + "]}");
  return { meta: meta, pakete: pakete, anzahl: chunkTexte.length };
}

/** Eine Anfrage; ruft fertig(code, text) — code 0 = kein Netz. */
function anfrage(methode, pfad, body, token, fertig) {
  var h = { "Content-Type": "application/json" };
  if (token) h["X-Device-Token"] = token;
  try {
    fetch.fetch({
      url: SERVER + pfad, method: methode, header: h, responseType: "text",
      data: methode === "GET" ? undefined : body,
      success: function (r) { fertig(r.code, typeof r.data === "string" ? r.data : JSON.stringify(r.data || "")); },
      fail: function (d, code) { fertig(0, "netz " + code); }
    });
  } catch (e) {
    fertig(0, "fetch " + e);
  }
}

function lies(uri, fertig) {
  file.readText({ uri: uri, success: function (d) { fertig(d.text); }, fail: function () { fertig(null); } });
}

/** An den Recorder haengen (app-wearable.js). Liefert das Direkt-Objekt (auch als R.direkt). */
function an(R) {
  var D = {
    token: "", fehler: 0, naechster: 0, laeuft: false, konfigZuletzt: 0,
    koppeln: null, koppelnLaeuft: false, koppelnZuletzt: 0, trennScharf: 0
  };

  function setzeToken(t) { D.token = t || ""; R.direktAn = D.token !== ""; }

  aktiv = D;

  lies(DATEI, function (text) {
    try { setzeToken(text ? JSON.parse(text).t : ""); } catch (e) { setzeToken(""); }
    if (D.token) log("gekoppelt");
  });

  D.koppelnStart = function () {
    if (D.koppelnLaeuft) return;
    D.koppelnLaeuft = true;
    D.koppeln = { code: "", claim: "", status: "" };
    anfrage("POST", "/api/devices/pair-init", JSON.stringify({ label: String(R.modell).substring(0, 120), platform: "huawei" }), "",
      function (code, text) {
        D.koppelnLaeuft = false;
        if (code !== 200) {
          D.koppeln = { code: "", claim: "", status: code === 0 ? "netz" : "fehler " + code };
          log("pair-init " + code + " " + text.substring(0, 80));
          return;
        }
        var p = JSON.parse(text);
        D.koppeln = { code: p.code, claim: p.claim_token, status: "" };
        log("Code da");
      });
  };

  /** Solange die Einstellungsseite offen ist (alle 2 s von dort, hier auf 5 s gebremst). */
  D.koppelnTakt = function () {
    var k = D.koppeln, jetzt = Date.now();
    if (D.token || !k || D.koppelnLaeuft || jetzt - D.koppelnZuletzt < 5000) return;
    D.koppelnZuletzt = jetzt;
    if (!k.claim) { D.koppelnStart(); return; }
    D.koppelnLaeuft = true;
    anfrage("GET", "/api/devices/pair-poll?claim_token=" + k.claim, "", "", function (code, text) {
      D.koppelnLaeuft = false;
      if (code === 404) { D.koppeln = null; D.koppelnStart(); return; }   // abgelaufen: neuer Code
      if (code !== 200) { k.status = code === 0 ? "netz" : "fehler " + code; return; }
      k.status = "";
      var t = JSON.parse(text).device_token;
      if (t) {
        setzeToken(t);
        D.koppeln = null; D.konfigZuletzt = 0; D.naechster = 0; D.fehler = 0;
        file.writeText({ uri: DATEI, text: JSON.stringify({ t: t }) });
        log("gekoppelt (neu)");
      }
    });
  };

  D.trennen = function () {
    setzeToken(""); D.koppeln = null; D.fehler = 0;
    file.delete({ uri: DATEI });
    log("getrennt");
  };

  /** Tippen auf die Zeile: nicht gekoppelt -> Code holen; gekoppelt -> zweimal binnen 4 s = trennen. */
  D.tippen = function () {
    if (!D.token) { if (!D.koppeln) D.koppelnStart(); return; }
    if (Date.now() - D.trennScharf < 4000) { D.trennScharf = 0; D.trennen(); return; }
    D.trennScharf = Date.now();
  };

  /** Wert fuer die Zeile auf der Einstellungsseite (tx = Texte der Seite). */
  D.text = function (tx) {
    if (D.token) return Date.now() - D.trennScharf < 4000 ? tx.disconnect + "?" : tx.connected;
    var k = D.koppeln;
    if (k && k.code) return k.code + " · " + tx.pairHint;
    if (k && k.status) return tx.pairNoNet;
    return k ? "…" : tx.connect;
  };

  function fehlschlag(was, code, text) {
    D.laeuft = false;
    D.fehler++;
    D.naechster = Date.now() + (D.fehler <= 1 ? 30000 : D.fehler === 2 ? 60000 : D.fehler === 3 ? 120000 : 300000);
    log(was + " " + code + " " + String(text).substring(0, 80) + " (Fehler " + D.fehler + ")");
  }

  function abgelehnt(wo) {
    D.laeuft = false;
    log("401 bei " + wo + " -> entkoppelt");
    D.trennen();
  }

  function pakete(id, liste, i, fertig) {
    if (i >= liste.length) { fertig(200, ""); return; }
    anfrage("POST", "/api/ingest/session/" + id + "/chunks", liste[i], D.token, function (code, text) {
      if (code !== 200) { fertig(code, text); return; }
      var soll = JSON.parse(liste[i]).chunks.length, ist = (JSON.parse(text).received || []).length;
      if (ist < soll) { fertig(500, "nur " + ist + " von " + soll + " quittiert"); return; }
      pakete(id, liste, i + 1, fertig);
    });
  }

  function hochladen(id, n) {
    D.laeuft = true;
    lies(K.dateiMeta(id), function (meta) {
      lies(K.dateiEnde(id), function (ende) {
        if (meta === null || ende === null) { fehlschlag("Meta/Ende fehlt " + id, -1, ""); return; }
        var chunks = [];
        (function naechster(i) {
          if (i >= n) { senden(); return; }
          lies(K.dateiChunk(id, i), function (c) {
            if (c === null) log("fehlt " + K.dateiChunk(id, i)); else chunks.push(c);   // ohne ihn, geloggt
            naechster(i + 1);
          });
        })(0);
        function senden() {
          log("lade " + id + " (" + chunks.length + " Chunks)");
          var up = upload(meta, chunks, [], PAKET);
          anfrage("POST", "/api/ingest/session", up.meta, D.token, function (code, text) {
            if (code === 401) { abgelehnt("ingest"); return; }
            if (code !== 200) { fehlschlag("upload " + id, code, text); return; }
            var da = JSON.parse(text).received_chunks || [];
            pakete(id, upload(meta, chunks, da, PAKET).pakete, 0, function (code2, text2) {
              if (code2 === 401) { abgelehnt("ingest"); return; }
              if (code2 !== 200) { fehlschlag("upload " + id, code2, text2); return; }
              anfrage("POST", "/api/ingest/session/" + id + "/complete", ende, D.token, function (code3, text3) {
                if (code3 === 401) { abgelehnt("ingest"); return; }
                if (code3 !== 200) { fehlschlag("complete " + id, code3, text3); return; }
                // Erst NACH /complete loeschen: bricht es vorher ab, ist alles noch da.
                var weg = R.plan.weg(id);
                for (var j = 0; j < weg.length; j++) file.delete({ uri: weg[j] });
                file.writeText({ uri: PLAN, text: JSON.stringify(R.plan.daten()) });
                D.laeuft = false; D.fehler = 0;
                log(id + " hochgeladen");
              });
            });
          });
        }
      });
    });
  }

  /** Alle 3 s: gekoppelt Konfiguration halbstuendlich, dann fertige Sessions. */
  D.takt = function () {
    var jetzt = Date.now();
    if (!D.token || D.laeuft || jetzt < D.naechster) return;
    if (jetzt - D.konfigZuletzt > KONFIG_ALLE_MS) {
      D.laeuft = true;
      anfrage("GET", "/api/devices/config?p=huawei&v=" + C.APP_VERSION, "", D.token, function (code, text) {
        if (code === 401) { abgelehnt("config"); return; }
        if (code !== 200) { fehlschlag("config", code, text); return; }
        D.laeuft = false; D.konfigZuletzt = Date.now();
        try {
          R.konfigAnwenden(new S.Konfig(JSON.parse(text)));
          file.writeText({ uri: KONFIG, text: text });
        } catch (e) { log("Konfig kaputt"); }
      });
      return;
    }
    var x = bereit(R.plan);
    if (x) hochladen(x.id, x.n);
  };

  // Infozeile: gekoppelt spielt das Handy keine Rolle — statt „App am Handy oeffnen" der eigene Stand.
  var alt = R.infoZeile;
  R.infoZeile = function (z, tx) {
    if (!D.token || z.fehler > 0 || (z.modus === "laeuft" && !z.gpsOk) || (z.modus !== "bereit" && z.ohneAccel) ||
        (z.modus === "bereit" && R.verworfen && Date.now() - R.verworfen < 10000)) return alt(z, tx);
    if (z.offen > 0) return z.plan.fertig + "/" + z.plan.gesamt + (D.fehler > 0 ? " · offline" : "");
    return z.modus === "bereit" ? tx.allSent : "";
  };

  D.uhr = setInterval(D.takt, 3000);
  R.direkt = D;
  return D;
}

export default { an: an, bereit: bereit, upload: upload, SERVER: SERVER };
