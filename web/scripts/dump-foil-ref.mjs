import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
const __dirname = dirname(fileURLToPath(import.meta.url));
const out = await build({ entryPoints: [resolve(__dirname,"../src/lib/foilPhysics.ts")], bundle:true, format:"esm", write:false, platform:"node" });
const dir = mkdtempSync(resolve(tmpdir(),"foilphys-"));
const file = resolve(dir,"foilPhysics.mjs"); writeFileSync(file, out.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href);
const PUMP = { heaveAmp_cm: 12, pumpFreq_hz: 1.0, recoveryLoss_pct: 35 };
const foils = [
  { span_cm: 125, area_cm2: 1660, thickness_mm: 26.1 },
  { span_cm: 100, area_cm2: 700,  thickness_mm: 13 },
  { span_cm: 90,  area_cm2: 2200, thickness_mm: 32 },
];
const speeds = [10,12,14,16,19];
const rows = [];
for (const f of foils) for (const s of speeds) {
  const r = mod.computeFoilPowerAtSpeed(f, s, { pump: PUMP });
  rows.push({ span_cm:f.span_cm, area_cm2:f.area_cm2, thickness_mm:f.thickness_mm, speed:s, ...r });
}
const dst = resolve(__dirname,"../../android/app/src/test/resources/foil-ref.json");
writeFileSync(dst, JSON.stringify(rows, null, 2));
console.log("wrote", rows.length, "rows ->", dst);
