// Hydrofoil-Physik — portiert aus docs/reference/foilcalculator.html (Jans Rechner).
// Reines, parametrisiertes Modul ohne DOM-Zugriff: alle Eingaben sind Argumente.
// Verifiziert gegen die Referenz-Implementierung (scripts/verify-foil-physics.mjs).
//
// Einheiten: Längen in cm/mm wie in der Foil-DB, Geschwindigkeit in km/h,
// Gewicht in kg, Leistung in Watt, Kräfte in Newton.

export const RHO_WATER = 1000;          // kg/m³
export const MU_WATER = 0.001;          // dynamische Viskosität (Pa·s)
export const G = 9.81;                   // m/s²
export const MAST_CHORD_LENGTH = 0.20;   // m (20 cm Profiltiefe)
export const MAST_CD_STREAMLINED = 0.10; // Cd stromlinienförmiger Mast
const MEAN_TO_ROOT_CHORD = 0.70;         // mittlere Chord ≈ 0.70 × Wurzel-Chord

export interface FoilDims {
  span_cm: number;
  area_cm2: number;
  thickness_mm: number;
}

export interface RiderParams {
  riderWeight: number;     // kg
  equipmentWeight: number; // kg
}

export interface MastParams {
  mastDiameter_mm: number; // 17 | 19
  mastDepth_m: number;     // 0.20 | 0.30 | 0.40 | 0.50 (untergetauchte Höhe)
}

export interface PumpParams {
  heaveAmp_cm: number;     // vertikale Pump-Amplitude
  pumpFreq_hz: number;     // Pump-Frequenz
  recoveryLoss_pct: number;// nicht zurückgewonnene Bewegungsenergie
}

// Defaults aus dem Referenz-Rechner.
export const DEFAULT_RIDER: RiderParams = { riderWeight: 95, equipmentWeight: 10 };
export const DEFAULT_MAST: MastParams = { mastDiameter_mm: 19, mastDepth_m: 0.4 };
export const DEFAULT_PUMP: PumpParams = { heaveAmp_cm: 12, pumpFreq_hz: 1.0, recoveryLoss_pct: 35 };

const totalWeightN = (r: RiderParams) => (r.riderWeight + r.equipmentWeight) * G;

// --- Geometrie ---------------------------------------------------------------

export function calculateAR(span_cm: number, area_cm2: number): number {
  const span_m = span_cm / 100;
  const area_m2 = area_cm2 / 10000;
  return (span_m * span_m) / area_m2;
}

export function calculateReynolds(chord_m: number, speed_kmh: number): number {
  const v_ms = speed_kmh / 3.6;
  return (RHO_WATER * v_ms * chord_m) / MU_WATER;
}

// Mittlere Chord = sqrt(Fläche / AR) [m].
export function calculateMeanChord(area_cm2: number, ar: number): number {
  return Math.sqrt((area_cm2 / 10000) / ar);
}

// t/c bezogen auf die WURZEL-Chord (gespeicherte Dicke = max./Wurzel-Dicke).
export function calculateThicknessRatio(thickness_mm: number, area_cm2: number, ar: number): number {
  const rootChord_m = calculateMeanChord(area_cm2, ar) / MEAN_TO_ROOT_CHORD;
  return (thickness_mm / 1000) / rootChord_m;
}

// --- Auftrieb ----------------------------------------------------------------

export function getCriticalReynolds(ar: number, thickness_ratio: number): number {
  let criticalRe = 80000;
  if (ar > 12) criticalRe += (ar - 12) * 15000;
  if (ar > 16) criticalRe += (ar - 16) * 20000;
  if (thickness_ratio < 0.15) criticalRe += 80000;
  if (thickness_ratio < 0.1) criticalRe += 60000;
  return Math.min(criticalRe, 400000);
}

export function calculateCLmax(ar: number, thickness_mm: number, area_cm2: number, speed_kmh = 15): number {
  const chord_m = calculateMeanChord(area_cm2, ar);
  const thickness_ratio = calculateThicknessRatio(thickness_mm, area_cm2, ar);
  const base_cl_max = 1.4;
  const ar_factor = Math.max(0.8, 1.3 - ar * 0.02);
  const thickness_factor = 0.8 + thickness_ratio * 2;
  const reynolds = calculateReynolds(chord_m, speed_kmh);
  const criticalRe = getCriticalReynolds(ar, thickness_ratio);
  let reynolds_factor = 1.0;
  if (reynolds < criticalRe) reynolds_factor = 0.3 + 0.7 * (reynolds / criticalRe);
  let profile_factor = 1.0;
  if (ar > 15 && thickness_ratio < 0.12) profile_factor = 0.8;
  return base_cl_max * ar_factor * thickness_factor * reynolds_factor * profile_factor;
}

// Benötigter CL für Auftrieb = Gewicht bei gegebener Geschwindigkeit.
export function calculateRequiredCL(area_cm2: number, speed_kmh: number, rider: RiderParams = DEFAULT_RIDER): number {
  const area_m2 = area_cm2 / 10000;
  const v_ms = speed_kmh / 3.6;
  return (2 * totalWeightN(rider)) / (RHO_WATER * area_m2 * v_ms * v_ms);
}

export function canGenerateLift(area_cm2: number, cl_max: number, speed_kmh: number, rider: RiderParams = DEFAULT_RIDER): boolean {
  return calculateRequiredCL(area_cm2, speed_kmh, rider) <= cl_max;
}

export function calculateMinViableSpeed(area_cm2: number, cl_max: number, rider: RiderParams = DEFAULT_RIDER): number {
  const area_m2 = area_cm2 / 10000;
  const practical_cl = cl_max * 0.8;
  const v_min_ms = Math.sqrt((2 * totalWeightN(rider)) / (RHO_WATER * area_m2 * practical_cl));
  return v_min_ms * 3.6;
}

export function calculateStallSpeed(area_cm2: number, cl_max: number, rider: RiderParams = DEFAULT_RIDER): number {
  const area_m2 = area_cm2 / 10000;
  const v_stall_ms = Math.sqrt((2 * totalWeightN(rider)) / (RHO_WATER * area_m2 * cl_max));
  return v_stall_ms * 3.6;
}

// --- Widerstand --------------------------------------------------------------

export function calculateCd(ar: number, thickness_mm: number, area_cm2: number, required_CL: number, speed_kmh = 15): number {
  const thickness_ratio = calculateThicknessRatio(thickness_mm, area_cm2, ar);
  const efficiency = 0.85; // Oswald-Wirkungsgrad
  const cd_induced = (required_CL * required_CL) / (Math.PI * ar * efficiency);
  const chord_m = calculateMeanChord(area_cm2, ar);
  const reynolds = Math.max(calculateReynolds(chord_m, speed_kmh), 1e5);
  const cf = 0.074 / Math.pow(reynolds, 0.2);
  const formFactor = 1 + 2 * thickness_ratio + 60 * Math.pow(thickness_ratio, 4);
  const cd_profile = 2 * cf * formFactor;
  return cd_induced + cd_profile;
}

export function calculateFoilDrag(area_cm2: number, cd: number, speed_kmh: number): number {
  const area_m2 = area_cm2 / 10000;
  const v_ms = speed_kmh / 3.6;
  return 0.5 * RHO_WATER * area_m2 * cd * v_ms * v_ms;
}

export interface MastDragResult {
  drag: number;
  cd_mast: number;
  frontal_area_m2: number;
  reynolds: number;
}

export function calculateMastDrag(speed_kmh: number, mast: MastParams = DEFAULT_MAST): MastDragResult {
  const thickness_m = mast.mastDiameter_mm / 1000;
  const frontal_area_m2 = thickness_m * mast.mastDepth_m;
  const v_ms = speed_kmh / 3.6;
  const reynolds_mast = (RHO_WATER * v_ms * MAST_CHORD_LENGTH) / MU_WATER;
  let cd_mast = MAST_CD_STREAMLINED;
  if (reynolds_mast < 50000) cd_mast = 0.15;
  else if (reynolds_mast > 500000) cd_mast = 0.08;
  const thickness_ratio = thickness_m / MAST_CHORD_LENGTH;
  const thickness_factor = 1.0 + (thickness_ratio - 0.08) * 1.5;
  cd_mast *= Math.max(0.7, thickness_factor);
  const drag = 0.5 * RHO_WATER * frontal_area_m2 * cd_mast * v_ms * v_ms;
  return { drag, cd_mast, frontal_area_m2, reynolds: reynolds_mast };
}

export function calculateOptimalSpeed(stall_speed: number): number {
  return Math.round(stall_speed * 1.75);
}

// --- Pump-Trägheit -----------------------------------------------------------

// Hydrodynamische Zusatzmasse eines vertikal pumpenden Foils (2D-Näherung) [kg].
export function calculateAddedMass(foil: FoilDims, ar?: number): number {
  const arEff = ar ?? calculateAR(foil.span_cm, foil.area_cm2);
  const c = calculateMeanChord(foil.area_cm2, arEff);
  const span_m = foil.span_cm / 100;
  return RHO_WATER * (Math.PI / 4) * c * c * span_m;
}

export function calculateLiftCurveSlopePerDeg(ar: number): number {
  return ((2 * Math.PI * ar) / (ar + 2)) * (Math.PI / 180);
}

export function calculateLiftPerDegree(ar: number, area_cm2: number, speed_kmh: number): number {
  const S = area_cm2 / 10000;
  const v = speed_kmh / 3.6;
  const q = 0.5 * RHO_WATER * v * v;
  const dL_N = calculateLiftCurveSlopePerDeg(ar) * q * S;
  return dL_N / G;
}

// Zusätzliche Pump-Leistung durch Trägheit (oszillierende + Schwungmasse) [W].
export function calculatePumpInertiaPower(
  foil: FoilDims,
  rider: RiderParams = DEFAULT_RIDER,
  pump: PumpParams = DEFAULT_PUMP,
  ar?: number,
): number {
  const a = pump.heaveAmp_cm / 100;
  const f = pump.pumpFreq_hz;
  const eta = pump.recoveryLoss_pct / 100;
  const M_eff = rider.riderWeight + rider.equipmentWeight + calculateAddedMass(foil, ar);
  const omega = 2 * Math.PI * f;
  return eta * M_eff * a * a * omega * omega * f;
}

// --- High-Level: Leistung bei Geschwindigkeit -------------------------------

export interface PowerResult {
  ar: number;
  requiredCL: number;
  cd: number;
  foilDrag: number;   // N
  mastDrag: number;   // N
  totalDrag: number;  // N
  dragPower: number;  // W (reine Vortriebsleistung)
  inertiaPower: number; // W (Pump-Trägheit, 0 wenn pump nicht übergeben)
  power: number;      // W (dragPower + inertiaPower)
}

export interface PowerOpts {
  rider?: RiderParams;
  mast?: MastParams;
  pump?: PumpParams; // wenn gesetzt -> Trägheitsanteil mitrechnen
}

// Theoretische Leistung, um ein Foil bei `speed_kmh` zu tragen.
// Hauptfunktion für Session-/Lauf-Detailansichten (Watt aus Foil + Gewicht + echtem Speed).
export function computeFoilPowerAtSpeed(foil: FoilDims, speed_kmh: number, opts: PowerOpts = {}): PowerResult {
  const rider = opts.rider ?? DEFAULT_RIDER;
  const mast = opts.mast ?? DEFAULT_MAST;
  const ar = calculateAR(foil.span_cm, foil.area_cm2);
  const requiredCL = calculateRequiredCL(foil.area_cm2, speed_kmh, rider);
  const cd = calculateCd(ar, foil.thickness_mm, foil.area_cm2, requiredCL, speed_kmh);
  const foilDrag = calculateFoilDrag(foil.area_cm2, cd, speed_kmh);
  const mastDrag = calculateMastDrag(speed_kmh, mast).drag;
  const totalDrag = foilDrag + mastDrag;
  const dragPower = totalDrag * (speed_kmh / 3.6);
  const inertiaPower = opts.pump ? calculatePumpInertiaPower(foil, rider, opts.pump, ar) : 0;
  return { ar, requiredCL, cd, foilDrag, mastDrag, totalDrag, dragPower, inertiaPower, power: dragPower + inertiaPower };
}
