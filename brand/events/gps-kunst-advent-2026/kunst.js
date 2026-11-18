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
// „Gefahren" statt gezeichnet (Jan 18.11.2026: „scharfe ecken sind schwierig"): jede Ecke wird zum Kurvenbogen
// (Wenderadius), dazu leichte Schlangenlinien wie beim Pumpen und ein Hauch GPS-Rauschen.
function gefahren(roh, radius, saat, welle) {
  let z = saat;
  const r = () => { z = (z * 1664525 + 1013904223) % 4294967296; return z / 4294967296 - 0.5; };
  const pts = [];
  const n = roh.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = roh[(i - 1 + n - 1) % (n - 1)], p1 = roh[i], p2 = roh[i + 1];
    const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const ra = Math.min(radius, d1 / 2.2, d2 / 2.2);
    const a = [p1[0] + (p0[0] - p1[0]) * ra / d1, p1[1] + (p0[1] - p1[1]) * ra / d1];
    const b = [p1[0] + (p2[0] - p1[0]) * ra / d2, p1[1] + (p2[1] - p1[1]) * ra / d2];
    for (let k = 0; k <= 10; k++) {          // Bogen um die Ecke (quadratische Kurve a -> p1 -> b)
      const t = k / 10;
      pts.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * p1[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * p1[1] + t * t * b[1]]);
    }
    const nx = roh[(i + 2) % (n - 1)] ?? p2;
    const d3 = Math.hypot(nx[0] - p2[0], nx[1] - p2[1]);
    const rb = Math.min(radius, d2 / 2.2, d3 / 2.2);
    const e = [p2[0] + (p1[0] - p2[0]) * rb / d2, p2[1] + (p1[1] - p2[1]) * rb / d2];
    const m = Math.max(2, Math.round(Math.hypot(e[0] - b[0], e[1] - b[1]) / 6));
    const nxv = -(e[1] - b[1]) / (Math.hypot(e[0] - b[0], e[1] - b[1]) || 1), nyv = (e[0] - b[0]) / (Math.hypot(e[0] - b[0], e[1] - b[1]) || 1);
    for (let k = 1; k < m; k++) {            // Gerade mit Pump-Schlangenlinie
      const t = k / m, w = Math.sin(t * Math.PI) * welle * Math.sin(k * 0.9 + i);
      pts.push([b[0] + (e[0] - b[0]) * t + nxv * w + r() * 1.2, b[1] + (e[1] - b[1]) * t + nyv * w + r() * 1.2]);
    }
  }
  pts.push(pts[0]);
  return "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L");
}
// Tannenbaum: drei Etagen, nach unten breiter, Stamm — Ecken als Boegen.
function baumPfad(cx, top, hoehe, breite, saat) {
  const krone = hoehe * 0.84, etagen = 3;
  const links = [[cx, top]];
  for (let i = 0; i < etagen; i++) {
    const yu = top + krone * (i + 1) / etagen;
    const w = (breite / 2) * (0.5 + 0.5 * (i + 1) / etagen);
    links.push([cx - w, yu]);
    if (i < etagen - 1) links.push([cx - w * 0.45, yu]);
  }
  const st = breite * 0.08, unten = top + krone;
  const stamm = [[cx - st, unten], [cx - st, top + hoehe], [cx + st, top + hoehe], [cx + st, unten]];
  const rechts = links.slice(1).reverse().map(([x, y]) => [2 * cx - x, y]);
  const roh = [...links, ...stamm, ...rechts, [cx, top]];
  return gefahren(roh, hoehe * 0.06, saat, hoehe * 0.008);
}
// Stern mit runden Spitzen.
function sternPfad(cx, cy, R, saat) {
  const roh = [];
  for (let i = 0; i <= 10; i++) {
    const w = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.5 : R;
    roh.push([cx + rr * Math.cos(w), cy + rr * Math.sin(w)]);
  }
  return gefahren(roh, R * 0.22, saat, 0);
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
