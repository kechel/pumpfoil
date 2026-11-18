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
// Tannenbaum als eine durchgehende "gefahrene" Linie mit leichtem GPS-Zittern: drei Etagen, nach unten breiter, Stamm.
function baumPfad(cx, top, hoehe, breite, saat) {
  let z = saat;
  const r = () => { z = (z * 1664525 + 1013904223) % 4294967296; return z / 4294967296 - 0.5; };
  const krone = hoehe * 0.84, etagen = 3;
  const links = [[cx, top]];
  for (let i = 0; i < etagen; i++) {
    const yu = top + krone * (i + 1) / etagen;                  // Unterkante der Etage
    const w = (breite / 2) * (0.5 + 0.5 * (i + 1) / etagen);     // halbe Breite der Etage
    links.push([cx - w, yu]);                                   // Ast nach aussen-unten
    if (i < etagen - 1) links.push([cx - w * 0.45, yu]);        // zurueck nach innen, naechste Etage beginnt
  }
  const st = breite * 0.07, unten = top + krone;
  const stamm = [[cx - st, unten], [cx - st, top + hoehe], [cx + st, top + hoehe], [cx + st, unten]];
  const rechts = links.slice(1).reverse().map(([x, y]) => [2 * cx - x, y]);
  const roh = [...links, ...stamm, ...rechts, [cx, top]];
  const pts = [];
  for (let i = 0; i < roh.length - 1; i++) {
    const [x1, y1] = roh[i], [x2, y2] = roh[i + 1];
    const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 9));
    for (let k = 0; k < n; k++) pts.push([x1 + (x2 - x1) * k / n + r() * 2.2, y1 + (y2 - y1) * k / n + r() * 2.2]);
  }
  pts.push(roh[roh.length - 1]);
  return "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L");
}
function sternPfad(cx, cy, R, saat) {
  let z = saat;
  const r = () => { z = (z * 1664525 + 1013904223) % 4294967296; return z / 4294967296 - 0.5; };
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const w = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.45 : R;
    pts.push([cx + rr * Math.cos(w) + r() * 1.5, cy + rr * Math.sin(w) + r() * 1.5]);
  }
  return "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L");
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
