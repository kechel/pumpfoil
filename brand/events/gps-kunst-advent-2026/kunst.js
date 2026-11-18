// Gemeinsame Zeichnung fuer alle Formate: Nachtblau, Schnee, Weihnachtsbaum + Stern als leuchtende GPS-Spur.
function schnee(svg, w, h, n, saat) {
  let z = saat;
  const r = () => { z = (z * 1664525 + 1013904223) % 4294967296; return z / 4294967296; };
  for (let i = 0; i < n; i++) {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", r() * w); c.setAttribute("cy", r() * h); c.setAttribute("r", 1.2 + r() * 3.2);
    c.setAttribute("fill", "#fff"); c.setAttribute("opacity", (0.2 + r() * 0.6).toFixed(2));
    svg.appendChild(c);
  }
}
// „Gefahren" statt gezeichnet (Jan 18.11.2026: „scharfe ecken sind schwierig", „nicht bis ganz ans ende und verbindung
// zum stern — durchgezogene linie"): EIN offener Track. Jede Ecke wird zum Kurvenbogen (Wenderadius), dazu leichte
// Schlangenlinien wie beim Pumpen und ein Hauch GPS-Rauschen. Anfang und Ende treffen sich nicht.
function gefahren(roh, radius, saat, welle) {
  let z = saat;
  const r = () => { z = (z * 1664525 + 1013904223) % 4294967296; return z / 4294967296 - 0.5; };
  const n = roh.length;
  // Eckpunkte -> (Bogenanfang, Ecke, Bogenende); an den Enden kein Bogen.
  const ecken = roh.map((p1, i) => {
    if (i === 0 || i === n - 1) return { a: p1, p: p1, b: p1 };
    const p0 = roh[i - 1], p2 = roh[i + 1];
    const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
    const ra = Math.min(radius, d1 / 2.2, d2 / 2.2);
    return { a: [p1[0] + (p0[0] - p1[0]) * ra / d1, p1[1] + (p0[1] - p1[1]) * ra / d1], p: p1,
             b: [p1[0] + (p2[0] - p1[0]) * ra / d2, p1[1] + (p2[1] - p1[1]) * ra / d2] };
  });
  const pts = [];
  ecken.forEach((e, i) => {
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push([(1 - t) ** 2 * e.a[0] + 2 * (1 - t) * t * e.p[0] + t * t * e.b[0], (1 - t) ** 2 * e.a[1] + 2 * (1 - t) * t * e.p[1] + t * t * e.b[1]]);
    }
    if (i === n - 1) return;
    const s0 = e.b, s1 = ecken[i + 1].a, L = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) || 1;
    const m = Math.max(2, Math.round(L / 6)), nx = -(s1[1] - s0[1]) / L, ny = (s1[0] - s0[0]) / L;
    for (let k = 1; k < m; k++) {
      const t = k / m, w = Math.sin(t * Math.PI) * welle * Math.sin(k * 0.9 + i);
      pts.push([s0[0] + (s1[0] - s0[0]) * t + nx * w + r() * 1.2, s0[1] + (s1[1] - s0[1]) * t + ny * w + r() * 1.2]);
    }
  });
  return "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L");
}
// Tannenbaum mit Stern als EIN Track: Stamm rechts unten -> Aeste rechts hoch -> Steg -> einmal um den Stern ->
// Steg zurueck -> Aeste links runter. Jan 18.11.2026: „am ende den kompletten letzten zacken weg, da ist er halt ins
// wasser gefallen, und auch nicht soo symmetrisch" -> links endet der Track nach der zweiten Etage, jeder Ast leicht
// verschoben (Saat), die Seiten sind nicht spiegelgleich.
function baumMitStern(cx, top, hoehe, breite, sternR, saat) {
  let z = saat * 7919 + 13;
  const r = () => { z = (z * 1664525 + 1013904223) % 4294967296; return z / 4294967296 - 0.5; };
  const krone = hoehe * 0.84, etagen = 3;
  // Links senkrecht gestreckt (Jan 18.11.2026: „die linke haelfte etwas vertikal gestreckter, nicht auf identischer
  // hoehe die horizontalen stuecke"): die Etagen links liegen tiefer als rechts.
  const seite = (vz, streck) => {                             // Aeste einer Seite von oben nach unten, je Seite anders
    const out = [];
    for (let i = 0; i < etagen; i++) {
      const yu = top + krone * streck * (i + 1) / etagen + r() * hoehe * 0.05;
      const w = (breite / 2) * (0.5 + 0.5 * (i + 1) / etagen) * (1 + r() * 0.22);
      out.push([cx + vz * w, yu]);
      if (i < etagen - 1) out.push([cx + vz * w * (0.45 + r() * 0.15), yu + r() * hoehe * 0.04]);
    }
    return out;
  };
  const rechts = seite(1, 0.95), links = seite(-1, 1.32);
  const st = breite * 0.08, unten = top + krone, boden = top + hoehe;
  // Oben eine gefahrene Schleife statt Stern (Jan 18.11.2026: „gefahrenen kreis … nicht 100% rund", „der anschluss an
  // den kreis muss auch gefahren werden"): von rechts unten tangential hinein, oben herum, links unten tangential hinaus
  // in die linken Aeste — kein Steg, keine Kehre.
  // Schlaufe mit Kreuzung: von rechts unten hinein, einmal ganz herum (gut 360°), unten ueber die eigene Spur, links
  // hinaus — die Kreuzung bleibt als Baumspitze sichtbar.
  const phase = r() * 6, kr = sternR * 1.1, ky = top - kr * 0.95;
  const schleife = [];
  for (let i = 0; i <= 22; i++) {
    const grad = 55 - i * (395 / 22);                         // 55° (rechts unten) gegen den Uhrzeiger bis -340° (= 20°, wieder rechts unten vorbei)
    const w = grad * Math.PI / 180;
    const rr = kr * (1 + 0.1 * Math.sin(2 * w + phase));
    schleife.push([cx + rr * Math.cos(w), ky + rr * Math.sin(w) * 0.9]);
  }
  // Links nur bis zum inneren Punkt der zweiten Etage, dann ein kurzes Stueck Richtung unterster Ast — Sturz.
  const l = links.slice(0, 4);
  const ende = [l[3][0] + (links[4][0] - l[3][0]) * 0.18, l[3][1] + (links[4][1] - l[3][1]) * 0.18];
  const roh = [
    [cx + st * 0.6, boden], [cx + st, boden - hoehe * 0.03], [cx + st, unten], ...rechts.slice().reverse(),
    ...schleife, ...l, ende,
  ];
  return gefahren(roh, hoehe * 0.06, saat, hoehe * 0.008);
}
function spur(svg, d, dick) {
  for (const [w, o] of [[dick * 3, 0.18], [dick * 1.8, 0.3], [dick, 1]]) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d); p.setAttribute("fill", "none"); p.setAttribute("stroke", "#22d3ee");
    p.setAttribute("stroke-width", w); p.setAttribute("stroke-opacity", o);
    p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
    svg.appendChild(p);
  }
}
