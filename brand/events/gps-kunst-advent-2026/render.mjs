// node render.mjs <zielordner>  — rendert banner.png (1600x400), banner-rahmen.png (mit Sicherheitsrahmen), quadrat.png
import { chromium } from "/srv/liegeplatz/render/node_modules/playwright-core/index.mjs";
import path from "node:path";
const ziel = process.argv[2] || ".";
const hier = path.dirname(new URL(import.meta.url).pathname);
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" });
for (const [datei, w, h, q, aus] of [["banner.html", 1600, 400, "", "banner.png"], ["banner.html", 1600, 400, "?rahmen=1", "banner-rahmen.png"], ["quadrat.html", 1080, 1080, "", "quadrat.png"]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("file://" + path.join(hier, datei) + q);
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(ziel, aus), clip: { x: 0, y: 0, width: w, height: h } });
  await p.close();
}
await b.close();
