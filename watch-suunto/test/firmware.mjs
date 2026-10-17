// Nachgebaute SuuntoPlus-Firmware fuer Node: laedt app/main.js wie die Uhr (globale Rueckrufe) und
// stellt bereit, was die Referenz beschreibt — appConn (BLE), evalFile, localStorage, setText,
// playIndication, enabledZappId. Die Funkstrecke ist ein Modell mit Latenz, Abbruechen und
// automatischem Wiederverbinden (Referenz: „Automatic reconnection is attempted by the system").
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { WURZEL } from "./lade.mjs";
import { Empfaenger } from "./empfaenger.mjs";

export class Uhr {
  constructor({ einstellungen = {}, latenzMs = 30 } = {}) {
    this.jetztMs = 0;
    this.texte = {};
    this.stile = {};
    this.vibration = [];
    this.speicher = new Map(Object.entries(einstellungen));
    this.empf = new Empfaenger();
    this.latenz = latenzMs;
    this.verbunden = false;          // Funkstrecke physisch da?
    this.handyDa = true;             // Handy in Reichweite (Teststeuerung)
    this.queue = [];                 // [zeitMs, fn]
    this.handler = null;
    this.writes = 0;
    this.notifyAn = false;
    const uhr = this;
    const ls = {
      getItem: (k) => (uhr.speicher.has(k) && typeof uhr.speicher.get(k) === "string" ? uhr.speicher.get(k) : null),
      setItem: (k, v) => uhr.speicher.set(k, String(v)),
      getObject: (k) => (uhr.speicher.has(k) && typeof uhr.speicher.get(k) === "object" ? uhr.speicher.get(k) : null),
      setObject: (k, v) => uhr.speicher.set(k, v),
    };
    const appConn = {
      connect(zapp, handler) {
        uhr.handler = handler;
        uhr.spaeter(5, () => uhr.handler(0, 111));
        uhr.versucheVerbinden();
        return 7;
      },
      regUuid(c, ch) { uhr.spaeter(uhr.latenz, () => uhr.verbunden && uhr.handler(ch, 107)); },
      enaCharNotf(c, ch) { uhr.spaeter(uhr.latenz, () => { if (uhr.verbunden) { uhr.notifyAn = true; uhr.handler(ch, 109); } }); },
      writeChar(c, ch, data) {
        if (data.length > 20) throw new Error("writeChar > 20 Bytes: " + data.length);
        uhr.writes++;
        const kopie = data.slice();
        uhr.spaeter(uhr.latenz, () => {
          if (!uhr.verbunden) return;          // Abbruch: kein WRITE_DONE, Firmware meldet 101
          uhr.empf.paket(kopie);
          uhr.handler(ch, 104);
        });
      },
      readChar() {},
    };
    this.ctx = vm.createContext({
      Math, JSON, Float32Array, Uint8Array, Int8Array, appConn, enabledZappId: 3, localStorage: ls,
      setText: (id, txt) => { uhr.texte[id] = String(txt); },
      setStyle: (id, p, v) => { (uhr.stile[id] = uhr.stile[id] || {})[p] = v; },
      playIndication: (n) => uhr.vibration.push([uhr.jetztMs, n]),
      systemEvent: () => {},
      // unload("_cm"): Firmware laedt die App-Seite neu und fragt getUserInterface erneut
      unload: () => { uhr.vorlage = uhr.ctx.getUserInterface({}, uhr.output || {}).template; },
      evalFile: (f) => {
        const name = f.replace("{file_path}/", "");
        return vm.runInContext("(" + fs.readFileSync(path.join(WURZEL, "app", name), "utf8") + ")", uhr.ctx);
      },
    });
    vm.runInContext(fs.readFileSync(path.join(WURZEL, "app/main.js"), "utf8"), this.ctx, { filename: "main.js" });
    // Quittung vom Handy alle 250 ms, Status alle 2 s
    this.naechsteQuittung = 250;
  }

  spaeter(ms, fn) { this.queue.push([this.jetztMs + ms, fn]); }

  versucheVerbinden() {
    if (!this.handler) return;
    if (this.handyDa && !this.verbunden) {
      this.spaeter(800, () => { if (this.handyDa && !this.verbunden) { this.verbunden = true; this.handler(0, 100); } });
    }
  }

  /** Handy weg / wieder da (Firmware meldet DISCONNECTED und verbindet selbst neu). */
  handy(da) {
    this.handyDa = da;
    if (!da && this.verbunden) { this.verbunden = false; this.notifyAn = false; this.handler(0, 101); }
    if (da) this.versucheVerbinden();
  }

  /** Zeit voranschalten und faellige Rueckrufe ausfuehren. */
  bis(ms) {
    while (true) {
      this.queue.sort((a, b) => a[0] - b[0]);
      const n = this.queue[0];
      const q = this.naechsteQuittung;
      const naechst = Math.min(n ? n[0] : Infinity, q);
      if (naechst > ms) break;
      this.jetztMs = naechst;
      if (naechst === q) {
        this.naechsteQuittung += 250;
        if (this.verbunden && this.notifyAn) this.handler(0, 106, this.empf.quittung());
        continue;
      }
      this.queue.shift();
      n[1]();
    }
    this.jetztMs = ms;
    if (!this.handyDa) return;
    if (!this.verbunden && this.handler && !this.queue.length) this.versucheVerbinden();
  }

  /** Was gerade auf der Datenseite steht: sichtbare Texte mit Position/Farbe. */
  sichtbar() {
    return Object.keys(this.stile).filter((id) => this.stile[id].visibility === "visible")
      .map((id) => ({ id, txt: this.texte[id], left: this.stile[id].left, top: this.stile[id].top, color: this.stile[id].color }));
  }

  ruf(name, input = {}, ...rest) {
    const f = this.ctx[name];
    if (typeof f !== "function") throw new Error("Rueckruf fehlt: " + name);
    return f(input, this.output || (this.output = {}), ...rest);
  }
}
