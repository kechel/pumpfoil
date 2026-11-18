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
// Steg zurueck -> Aeste links runter -> Stamm links unten, kurz vor dem Start Schluss.
function baumMitStern(cx, top, hoehe, breite, sternR, saat) {
  const krone = hoehe * 0.84, etagen = 3;
  const links = [];                                          // von oben nach unten, linke Seite
  for (let i = 0; i < etagen; i++) {
    const yu = top + krone * (i + 1) / etagen;
    const w = (breite / 2) * (0.5 + 0.5 * (i + 1) / etagen);
    links.push([cx - w, yu]);
    if (i < etagen - 1) links.push([cx - w * 0.45, yu]);
  }
  const st = breite * 0.08, unten = top + krone, boden = top + hoehe;
  const rechtsHoch = links.slice().reverse().map(([x, y]) => [2 * cx - x, y]);
  const sy = top - sternR * 1.25;                            // Sternmitte ueber der Spitze
  const unterpunkt = [cx, sy + sternR * 0.5];                // innerer Punkt unten am Stern
  const stern = [];
  for (let i = 5; i <= 15; i++) {                            // einmal herum, vom unteren Innenpunkt zurueck dorthin
    const w = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? sternR * 0.5 : sternR;
    stern.push([cx + rr * Math.cos(w), sy + rr * Math.sin(w)]);
  }
  const roh = [
    [cx + st, boden - hoehe * 0.02], [cx + st, unten], ...rechtsHoch, [cx + 2, top], unterpunkt,
    ...stern.slice(1, -1), unterpunkt, [cx - 2, top], ...links, [cx - st, unten], [cx - st, boden], [cx + st * 0.2, boden],
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
