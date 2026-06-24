// Verifiziert web/src/lib/foilPhysics.ts gegen die Referenz-Formeln aus
// docs/reference/foilcalculator.html. Die Referenz unten ist eine 1:1-Kopie der
// dortigen reinen Funktionen mit den Default-Eingaben des Rechners fest verdrahtet
// (Rider 95+10 kg, Mast 19 mm / 0.40 m, Pump 12 cm / 1.0 Hz / 35 %, Modus "pumping").
//
// Aufruf:  node scripts/verify-foil-physics.mjs
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Referenz-Implementierung (gespiegelt) ----------------------------------
const RHO_WATER = 1000, MU_WATER = 0.001, G = 9.81;
const MAST_CHORD_LENGTH = 0.20, MAST_CD_STREAMLINED = 0.10, MEAN_TO_ROOT_CHORD = 0.70;
const riderWeight = 95, equipmentWeight = 10;
const mastDiameter = 19, mastDepth = 0.40;
const heaveAmp = 12, pumpFreq = 1.0, recoveryLoss = 35;
const totalWeight = (riderWeight + equipmentWeight) * G;

const refAR = (span_cm, area_cm2) => ((span_cm / 100) ** 2) / (area_cm2 / 10000);
const refReynolds = (chord_m, v) => (RHO_WATER * (v / 3.6) * chord_m) / MU_WATER;
const refMeanChord = (area_cm2, ar) => Math.sqrt((area_cm2 / 10000) / ar);
const refTRatio = (t_mm, area_cm2, ar) => (t_mm / 1000) / (refMeanChord(area_cm2, ar) / MEAN_TO_ROOT_CHORD);
function refCritRe(ar, tr) {
  let c = 80000;
  if (ar > 12) c += (ar - 12) * 15000;
  if (ar > 16) c += (ar - 16) * 20000;
  if (tr < 0.15) c += 80000;
  if (tr < 0.10) c += 60000;
  return Math.min(c, 400000);
}
function refRequiredCL(area_cm2, speed) {
  const v = speed / 3.6;
  return (2 * totalWeight) / (RHO_WATER * (area_cm2 / 10000) * v * v);
}
function refCd(ar, t_mm, area_cm2, CL, speed) {
  const tr = refTRatio(t_mm, area_cm2, ar);
  const cd_i = (CL * CL) / (Math.PI * ar * 0.85);
  const re = Math.max(refReynolds(refMeanChord(area_cm2, ar), speed), 1e5);
  const cf = 0.074 / Math.pow(re, 0.2);
  const ff = 1 + 2 * tr + 60 * Math.pow(tr, 4);
  return cd_i + 2 * cf * ff;
}
const refFoilDrag = (area_cm2, cd, speed) => 0.5 * RHO_WATER * (area_cm2 / 10000) * cd * (speed / 3.6) ** 2;
function refMastDrag(speed) {
  const t_m = mastDiameter / 1000;
  const frontal = t_m * mastDepth;
  const v = speed / 3.6;
  const re = (RHO_WATER * v * MAST_CHORD_LENGTH) / MU_WATER;
  let cd = MAST_CD_STREAMLINED;
  if (re < 50000) cd = 0.15; else if (re > 500000) cd = 0.08;
  const tr = t_m / MAST_CHORD_LENGTH;
  cd *= Math.max(0.7, 1.0 + (tr - 0.08) * 1.5);
  return 0.5 * RHO_WATER * frontal * cd * v * v;
}
function refAddedMass(foil, ar) {
  const c = refMeanChord(foil.area_cm2, ar);
  return RHO_WATER * (Math.PI / 4) * c * c * (foil.span_cm / 100);
}
function refInertiaPower(foil, ar) {
  const a = heaveAmp / 100, f = pumpFreq, eta = recoveryLoss / 100;
  const M = riderWeight + equipmentWeight + refAddedMass(foil, ar);
  const omega = 2 * Math.PI * f;
  return eta * M * a * a * omega * omega * f;
}
function refPower(foil, speed) {
  const ar = refAR(foil.span_cm, foil.area_cm2);
  const CL = refRequiredCL(foil.area_cm2, speed);
  const cd = refCd(ar, foil.thickness_mm, foil.area_cm2, CL, speed);
  const foilDrag = refFoilDrag(foil.area_cm2, cd, speed);
  const mastDrag = refMastDrag(speed);
  const totalDrag = foilDrag + mastDrag;
  const dragPower = totalDrag * (speed / 3.6);
  const inertiaPower = refInertiaPower(foil, ar);
  return { ar, requiredCL: CL, cd, foilDrag, mastDrag, totalDrag, dragPower, inertiaPower, power: dragPower + inertiaPower };
}

// --- Modul kompilieren & laden ----------------------------------------------
const out = await build({
  entryPoints: [resolve(__dirname, "../src/lib/foilPhysics.ts")],
  bundle: true, format: "esm", write: false, platform: "node",
});
const dir = mkdtempSync(resolve(tmpdir(), "foilphys-"));
const file = resolve(dir, "foilPhysics.mjs");
writeFileSync(file, out.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href);

// --- Vergleich ---------------------------------------------------------------
const PUMP = { heaveAmp_cm: 12, pumpFreq_hz: 1.0, recoveryLoss_pct: 35 };
const foils = [
  { brand: "Gong TRAIL L", span_cm: 125, area_cm2: 1660, thickness_mm: 26.1 },
  { brand: "High-AR thin", span_cm: 100, area_cm2: 700, thickness_mm: 13 },
  { brand: "Big low-AR", span_cm: 90, area_cm2: 2200, thickness_mm: 32 },
];
const speeds = [10, 12, 14, 16, 19];
const TOL = 1e-6;
let checks = 0, fails = 0;
const near = (a, b) => Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a), Math.abs(b));

for (const f of foils) {
  for (const s of speeds) {
    const ref = refPower(f, s);
    const got = mod.computeFoilPowerAtSpeed(f, s, { pump: PUMP });
    for (const k of Object.keys(ref)) {
      checks++;
      if (!near(ref[k], got[k])) {
        fails++;
        console.error(`MISMATCH ${f.brand} @${s}km/h .${k}: ref=${ref[k]} got=${got[k]}`);
      }
    }
  }
}

// Beispielausgabe (ein realer Fall) zur Sichtkontrolle.
const demo = mod.computeFoilPowerAtSpeed(foils[0], 14, { pump: PUMP });
console.log(`Demo Gong TRAIL L @14km/h: dragPower=${demo.dragPower.toFixed(1)}W ` +
  `inertia=${demo.inertiaPower.toFixed(1)}W total=${demo.power.toFixed(1)}W (AR=${demo.ar.toFixed(1)})`);

console.log(`${checks - fails}/${checks} Werte stimmen mit der Referenz überein.`);
if (fails > 0) { console.error(`FAIL: ${fails} Abweichungen.`); process.exit(1); }
console.log("OK: Foil-Physik-Modul entspricht der Referenz.");
