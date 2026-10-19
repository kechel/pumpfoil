// Nachgebaute Handy-Seite des Funkprotokolls v1 (docs/SUUNTO.md). Referenz fuer SuuntoBruecke.kt/.swift:
// setzt Bloecke aus Kopf + Teilen zusammen, sammelt GPS und Ereignisse und baut die Quittung.

export class Empfaenger {
  constructor() {
    this.hallo = null;
    this.bloecke = new Map();     // nr -> { t, n, daten: Uint8Array, hat: Set(teil) }
    this.gps = new Map();         // sek -> {...}
    this.ereignisse = new Map();  // nr -> {art, t, sek}
    this.position = null;
    this.aktivitaet = null;       // SPORT (Typ 7): Suunto-Sportmodus der Aufnahme
    this.sportPakete = 0;
    this.fertigBis = -1;          // Accel: alle Bloecke bis hier vollstaendig (oder aufgegeben)
    this.sekBis = -1;
    this.ereigBis = -1;
    this.pakete = 0;
  }

  paket(p) {
    this.pakete++;
    const typ = p[0] & 15, dv = new DataView(Uint8Array.from(p).buffer);
    if (typ === 1) {
      this.hallo = { ver: p[1], hz: p[2], display: String.fromCharCode(p[3]), appVer: dv.getUint16(4, true),
        uhrId: dv.getUint32(6, true), sitzung: dv.getUint32(10, true), flags: p[14], einheit: p[15],
        stdHash: p.length >= 20 ? dv.getUint32(16, true) : 0 };
    } else if (typ === 2) {
      const nr = this.voll(dv.getUint16(1, true)), n = p[7];
      const b = this.blockHolen(nr, n);
      b.t = dv.getUint32(3, true);
      b.daten.set(p.slice(8), 0);
      b.hat.add(0);
    } else if (typ === 3) {
      const teil = p[0] >> 4;
      // Teilpaket traegt nur das untere Byte der Blocknummer: zum naechstliegenden offenen Block
      const nr = this.zuordnen(p[1]);
      if (nr === null) return;
      const b = this.bloecke.get(nr);
      b.daten.set(p.slice(2), 12 + (teil - 1) * 18);
      b.hat.add(teil);
    } else if (typ === 4) {
      const nr = this.vollSek(dv.getUint16(17, true));
      const sp = dv.getUint16(11, true);
      this.gps.set(nr, { nr, sek: dv.getUint16(1, true), lat: dv.getInt32(3, true) / 1e7, lon: dv.getInt32(7, true) / 1e7,
        speed: sp === 0xFFFF ? -1 : sp / 100, hr: p[13], acc: p[14] === 255 ? null : p[14],
        alt: dv.getInt16(15, true) });
    } else if (typ === 5) {
      this.ereignisse.set(p[1], { nr: p[1], art: p[2], t: dv.getUint32(3, true), sek: dv.getUint16(7, true) });
    } else if (typ === 6) {
      this.position = [dv.getInt32(1, true) / 1e7, dv.getInt32(5, true) / 1e7];
    } else if (typ === 7 && p.length >= 3) {
      this.aktivitaet = dv.getUint16(1, true); this.sportPakete++;
    }
    this.nachziehen();
  }

  blockHolen(nr, n) {
    let b = this.bloecke.get(nr);
    if (!b) { b = { nr, t: 0, n, daten: new Uint8Array(n * 6), hat: new Set() }; this.bloecke.set(nr, b); }
    return b;
  }

  teile(n) { return 1 + Math.max(0, Math.ceil((n * 6 - 12) / 18)); }
  vollstaendig(b) { return b.hat.size >= this.teile(b.n); }

  // u16 -> voller Zaehler, nahe am bisherigen Stand (Bloecke laufen nur vorwaerts)
  voll(u) {
    const ref = this.fertigBis + 1;
    let v = ref - ((ref - u) & 0xFFFF);
    if (ref - v > 0x8000) v += 0x10000;
    while (v < ref - 0x8000) v += 0x10000;
    return v;
  }
  vollSek(u) {
    const ref = this.sekBis + 1;
    let v = ref - ((ref - u) & 0xFFFF);
    if (ref - v > 0x8000) v += 0x10000;
    return v;
  }
  zuordnen(lo) {
    // juengster bekannter, noch unvollstaendiger Block mit diesem unteren Byte
    let best = null;
    for (const nr of this.bloecke.keys()) if ((nr & 255) === lo && !this.vollstaendig(this.bloecke.get(nr))) {
      if (best === null || nr > best) best = nr;
    }
    return best;
  }

  nachziehen() {
    // Accel: Luecken, hinter denen schon spaetere Bloecke vollstaendig sind, gelten als verloren
    // (die Uhr schickt streng aufsteigend ab Quittung+1 — was davor fehlt, kommt nie mehr).
    let n = this.fertigBis + 1;
    for (;;) {
      const b = this.bloecke.get(n);
      if (b && this.vollstaendig(b)) { this.fertigBis = n; n++; continue; }
      let spaeter = false;
      for (const [k, v] of this.bloecke) if (k > n && this.vollstaendig(v) && !b) { spaeter = true; break; }
      if (spaeter) { this.fertigBis = n; n++; continue; }
      break;
    }
    let s = this.sekBis + 1;
    for (;;) {
      if (this.gps.has(s)) { this.sekBis = s; s++; continue; }
      let spaeter = false;
      for (const k of this.gps.keys()) if (k > s) { spaeter = true; break; }
      if (spaeter) { this.sekBis = s; s++; continue; }
      break;
    }
    while (this.ereignisse.has((this.ereigBis + 1) & 255) && this.ereignisse.get((this.ereigBis + 1) & 255).gesehen !== true) {
      this.ereignisse.get((this.ereigBis + 1) & 255).gesehen = true;
      this.ereigBis = (this.ereigBis + 1) & 255;
    }
  }

  quittung() {
    const f = (this.fertigBis >= 0 ? 1 : 0) | (this.sekBis >= 0 ? 2 : 0) | (this.ereigBis >= 0 ? 4 : 0);
    const b = this.fertigBis & 0xFFFF, s = this.sekBis & 0xFFFF;
    return [0x81, b & 255, b >> 8, s & 255, s >> 8, this.ereigBis & 255, f];
  }

  /** Accel als int16-Werte je Block (nur vollstaendige), aufsteigend. */
  accelBloecke() {
    return [...this.bloecke.values()].filter((b) => this.vollstaendig(b)).sort((a, b) => a.nr - b.nr)
      .map((b) => ({ nr: b.nr, t: b.t, werte: Array.from(new Int16Array(b.daten.buffer.slice(0, b.n * 6))) }));
  }
}
