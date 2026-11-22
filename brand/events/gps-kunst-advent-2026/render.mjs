// node render.mjs <zielordner>  — banner.png, banner-rahmen.png, quadrat.png, hochkant.png und die Short-Streifen
// streifen-<1..4>-<transparent|weiss>.png (aufbauend wie beim Flying Sprint Weekend).
import { chromium } from "/srv/liegeplatz/render/node_modules/playwright-core/index.mjs";
import path from "node:path";
const ziel = process.argv[2] || ".";
const hier = path.dirname(new URL(import.meta.url).pathname);
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const jobs = [["banner.html", 1600, 400, "", "banner.png"], ["banner.html", 1600, 400, "?rahmen=1", "banner-rahmen.png"],
              ["quadrat.html", 1080, 1080, "", "quadrat.png"], ["hochkant.html", 1080, 1350, "", "hochkant.png"],
              ["hochkant.html", 1080, 1350, "?transparent=1", "hochkant-transparent.png"]];
for (const weiss of [false, true]) for (let st = 1; st <= 4; st++)
  jobs.push(["streifen.html", 1080, 480, `?stufe=${st}${weiss ? "&weiss=1" : ""}`, `streifen-${st}-${weiss ? "weiss" : "transparent"}.png`]);
for (const [datei, w, h, q, aus] of jobs) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("file://" + path.join(hier, datei) + q);
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(ziel, aus), clip: { x: 0, y: 0, width: w, height: h }, omitBackground: datei === "streifen.html" || q.includes("transparent") });
  await p.close();
}
await b.close();
