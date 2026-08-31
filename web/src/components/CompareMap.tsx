import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { basiskarten } from "../lib/mapTiles";
import { SessionSummary } from "../lib/api";
import { rampColor, hrColor, hrRange as hrRangeOf, speedColor, optimalColor, OPTIMAL_SPAN } from "../lib/trackColors";
import { DEFAULT_RIDER, calculateAR, calculateCLmax, calculateStallSpeed, calculateOptimalSpeed, riderWeightFor } from "../lib/foilPhysics";
import { useT } from "../i18n";
import { usePumpFmt } from "../lib/pumpRate";
import { useCloseOnBack } from "../lib/useCloseOnBack";
import { syncPlan } from "../lib/syncPlayback";
import { fmtTime } from "../lib/time";

export interface CompareMapItem {
  key: string;
  session: SessionSummary;
  runIdx: number | null;     // null = ganze Session, sonst nur dieser Lauf
  color: string;             // Legendenfarbe (je Eintrag)
  riderColor: string;        // Farbe je Fahrer
  rider: string | null;      // Anzeigename des Fahrers
}

type Mode = "rider" | "track" | "speed" | "optimal" | "pump" | "hr";
const MAX_DRAW_GAP_M = 30;

// Optimale Geschwindigkeit (km/h) des Foils einer Session beim gegebenen Fahrergewicht.
// Die optimale Geschwindigkeit haengt ueber die Stall-Geschwindigkeit an der WURZEL des Gewichts —
// also am Gewicht des FAHRERS, nicht des Betrachters. Mit dem eigenen Gewicht gerechnet erschien
// der Track eines leichteren Fahrers durchgehend „zu langsam" (blau) und der eines schwereren
// „zu schnell" (rot), inklusive falscher Zahl in der Legende.
function optimalKmhFor(session: SessionSummary, weight: number | null): number | null {
  const fo = session.foil;
  if (!fo?.span_cm || !fo?.area_cm2 || !fo?.thickness_mm) return null;
  const rider = { riderWeight: riderWeightFor(session, weight), equipmentWeight: DEFAULT_RIDER.equipmentWeight };
  const ar = calculateAR(fo.span_cm, fo.area_cm2);
  const clmax = calculateCLmax(ar, fo.thickness_mm, fo.area_cm2, 15);
  const stall = calculateStallSpeed(fo.area_cm2, clmax, rider);
  return calculateOptimalSpeed(stall);
}

// Foiling-Geschwindigkeiten (km/h) eines Items für die Auto-Skala.
function itemSpeeds(it: CompareMapItem, win: string): number[] {
  const gj = it.session.analysis?.track_geojson;
  const segs = it.session.analysis?.segments ?? [];
  if (!gj || !segs.length) return [];
  const speeds: number[] = gj.properties?.speeds?.[win] ?? gj.properties?.speeds_mps ?? [];
  const ranges = it.runIdx != null && segs[it.runIdx] ? [segs[it.runIdx]] : segs;
  const out: number[] = [];
  for (const s of ranges)
    for (let i = s.i_start; i <= s.i_end; i++) {
      const v = speeds[i];
      if (v != null && isFinite(v)) out.push(v * 3.6);
    }
  return out;
}

export function CompareMap({ items, win, weight }: { items: CompareMapItem[]; win: "1" | "3" | "5"; weight: number | null }) {
  const t = useT();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);

  // Karte beim Unmount zerstoeren — sonst bleibt Leaflets Tastatur-Handler am `document`
  // haengen und schluckt -, _, +, *, 6, & und die Pfeiltasten auf der ganzen Seite
  // (Befund 17.08., ausfuehrlich in Spots.tsx).
  useEffect(() => () => { mapObj.current?.remove(); mapObj.current = null; }, []);
  const layer = useRef<L.LayerGroup | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useCloseOnBack(fullscreen, () => setFullscreen(false));

  // Default: nach Fahrer einfärben, wenn mehrere Fahrer dabei sind, sonst je Track.
  const riders = useMemo(() => new Set(items.map((i) => i.rider ?? "?")), [items]);
  const [mode, setMode] = useState<Mode>("rider");
  useEffect(() => { setMode(riders.size > 1 ? "rider" : "track"); }, [riders.size]);

  // Datenverfügbarkeit über alle Items.
  const hasPump = items.some((it) => (it.session.analysis?.track_geojson?.properties?.pump_hz ?? []).some((v: number | null) => v != null));
  // 0 = kein Messwert: eine Session, in der ALLE Werte 0 sind, hat keinen Puls — sonst boete die
  // Karte den Puls-Modus an und faerbte alles grau.
  const hasHr = items.some((it) => (it.session.analysis?.track_geojson?.properties?.hr ?? []).some((v: number | null) => v != null && v > 0));
  const anyOptimal = items.some((it) => optimalKmhFor(it.session, weight) != null);

  // Modus fällt zurück, wenn die nötigen Daten fehlen.
  useEffect(() => {
    if (mode === "pump" && !hasPump) setMode("rider");
    if (mode === "hr" && !hasHr) setMode("rider");
    if (mode === "optimal" && !anyOptimal) setMode("rider");
  }, [mode, hasPump, hasHr, anyOptimal]);

  // Geteilte Skalen über alle Items.
  const speedRange = useMemo<[number, number]>(() => {
    const vals = items.flatMap((it) => itemSpeeds(it, win));
    if (!vals.length) return [0, 40];
    return [Math.max(0, Math.floor(Math.min(...vals))), Math.min(60, Math.ceil(Math.max(...vals)))];
  }, [items, win]);
  const pumpRange = useMemo<[number, number]>(() => {
    const vals = items.flatMap((it) => (it.session.analysis?.track_geojson?.properties?.pump_hz ?? []).filter((v: number | null): v is number => v != null));
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 2];
  }, [items]);
  // Bereich ueber ALLE verglichenen Sessions zusammen (Jan: „min aller sessions bis max aller
  // sessions im vergleich") — zentral in lib/trackColors, damit Karte und Puls-Streifen dieselbe
  // Skala benutzen.
  const hrRange = useMemo<[number, number]>(
    () => hrRangeOf(...items.map((it) => it.session.analysis?.track_geojson?.properties?.hr ?? [])),
    [items],
  );

  const [autoScale, setAutoScale] = useState(true);
  const [sLo, setSLo] = useState(speedRange[0]);
  const [sHi, setSHi] = useState(speedRange[1]);
  useEffect(() => { if (autoScale) { setSLo(speedRange[0]); setSHi(speedRange[1]); } }, [autoScale, speedRange]);

  // Karte initialisieren + auf alle Tracks zoomen.
  useEffect(() => {
    if (!mapRef.current) return;
    if (!mapObj.current) {
      mapObj.current = L.map(mapRef.current, { zoomControl: false, maxZoom: 22 });
      L.control.zoom({ position: "bottomright" }).addTo(mapObj.current);
      basiskarten(mapObj.current, { street: t("map.street"), satellite: t("map.satellite") }, { maxZoom: 22 });
      layer.current = L.layerGroup().addTo(mapObj.current);
    }
    const all: [number, number][] = [];
    for (const it of items) {
      const gj = it.session.analysis?.track_geojson;
      const segs = it.session.analysis?.segments ?? [];
      if (!gj) continue;
      const coords: [number, number][] = gj.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
      const ranges = it.runIdx != null && segs[it.runIdx] ? [segs[it.runIdx]] : segs;
      for (const s of ranges) for (let i = s.i_start; i <= s.i_end; i++) if (coords[i]) all.push(coords[i]);
    }
    if (all.length) mapObj.current.fitBounds(L.latLngBounds(all), { padding: [24, 24] });
    setTimeout(() => mapObj.current?.invalidateSize(), 100);
  }, [items, fullscreen]);

  // Tracks (neu) zeichnen.
  // ── Synchrones Abspielen ────────────────────────────────────────────────────────────────
  // Nur angeboten, wenn sich mindestens zwei der verglichenen Sessions zeitlich ueberschneiden
  // UND am gleichen Spot liegen (Jan). Die Zeitrechnung steckt in lib/syncPlayback.ts — dort
  // steht auch, warum „ein GPS-Punkt = eine Sekunde" hier NICHT reicht.
  const plan = useMemo(() => {
    const gesehen = new Set<number>();
    const eindeutig = items.map((i) => i.session).filter((s) => !gesehen.has(s.id) && gesehen.add(s.id));
    return syncPlan(eindeutig);
  }, [items]);
  // Wie viel Leerlauf faellt weg — das ist die Zahl, die den Nutzen erklaert.
  const uebersprungenMin = useMemo(() => {
    if (!plan) return 0;
    const von = Math.min(...plan.sessions.map((s) => plan.achsen.get(s.id)!.von));
    const bis = Math.max(...plan.sessions.map((s) => plan.achsen.get(s.id)!.bis));
    return Math.max(0, (bis - von) - plan.dauerMs) / 60000;
  }, [plan]);
  const [spielt, setSpielt] = useState(false);
  const [tempo, setTempo] = useState(8);
  const [pos, setPos] = useState(0);            // ms in der Wiedergabe (ohne die Leerlaufzeiten)
  const posRef = useRef(0);
  const spielerLayer = useRef<L.LayerGroup | null>(null);
  // Der Plan haengt an den Sessions: wechselt der Korb, faengt die Wiedergabe von vorn an.
  useEffect(() => { setSpielt(false); setPos(0); posRef.current = 0; }, [plan]);

  // Zeichendaten je Session: Punkte (Leaflet-Reihenfolge lat/lon), Fahrerfarbe und die Farbe an
  // einem Index. BEIDE Zeichner benutzen das — die statische Karte und die Wiedergabe. Sonst
  // faerbt die Wiedergabe anders als die Karte, die man eine Sekunde vorher angesehen hat.
  const bahnen = useMemo(() => {
    const m = new Map<number, {
      pts: [number, number][]; farbe: string; name: string; farbeAn: (i: number) => string;
    }>();
    for (const it of items) {
      if (m.has(it.session.id)) continue;
      const gj = it.session.analysis?.track_geojson;
      const c = gj?.geometry?.coordinates;
      if (!c) continue;
      const speeds: number[] = gj.properties?.speeds?.[win] ?? gj.properties?.speeds_mps ?? [];
      const phz: (number | null)[] = gj.properties?.pump_hz ?? [];
      const hr: (number | null)[] = gj.properties?.hr ?? [];
      const opt = optimalKmhFor(it.session, weight) ?? 0;
      const farbeAn = (i: number): string => {
        if (mode === "rider") return it.riderColor;
        if (mode === "track") return it.color;
        if (mode === "speed") return speedColor((speeds[i] ?? 0) * 3.6, sLo, sHi);
        if (mode === "optimal") return optimalColor((speeds[i] ?? 0) * 3.6, opt);
        if (mode === "pump") {
          const v = phz[i]; const [lo, hi] = pumpRange;
          return v == null ? "#64748b" : rampColor((v - lo) / Math.max(hi - lo, 1e-6));
        }
        return hrColor(hr[i], hrRange);
      };
      m.set(it.session.id, {
        pts: c.map((p: [number, number]) => [p[1], p[0]] as [number, number]),
        farbe: it.riderColor,
        name: it.rider ?? "—",
        farbeAn,
      });
    }
    return m;
  }, [items, mode, win, sLo, sHi, pumpRange, hrRange, weight]);

  // Wiedergabe laeuft = die Karte gehoert dem Abspieler. Erst ab dem ersten Antippen von Start
  // oder dem ersten Ziehen am Regler; bei Position 0 und Pause steht wieder die normale
  // Vergleichsansicht mit beiden vollstaendigen Strecken da.
  const spielModus = !!plan && (spielt || pos > 0);

  // Einen Zeitpunkt zeichnen: je Fahrer der Lauf, in dem er GERADE ist — und der nur bis zu
  // seiner aktuellen Position, dazu der Marker an der Spitze.
  //
  // Bewusst nicht die ganze Strecke: bei drei Fahrern am selben Spot liegen die vollstaendigen
  // Tracks als Knaeuel uebereinander und man sieht der Bewegung nicht mehr an, wer wo ist. Nur
  // der laufende Lauf, wachsend, macht die Gleichzeitigkeit sichtbar — genau wofuer die
  // Wiedergabe da ist. Wer gerade zwischen zwei Laeufen treibt, behaelt den Marker (er IST ja da),
  // hat aber keine Linie; wer zu dem Zeitpunkt gar nicht aufgezeichnet hat, faellt ganz weg,
  // statt eingefroren irgendwo zu stehen und Gleichzeitigkeit vorzutaeuschen.
  const zeichneStand = (posMs: number) => {
    const lg = spielerLayer.current;
    if (!lg || !plan) return;
    lg.clearLayers();
    const tAbs = plan.zuUhrzeit(posMs);
    for (const s of plan.sessions) {
      const achse = plan.achsen.get(s.id);
      const bahn = bahnen.get(s.id);
      if (!achse || !bahn) continue;
      const i = achse.index(tAbs);
      if (i == null) continue;

      // Der Lauf, der diesen Index enthaelt. Zwischen zwei Laeufen gibt es keinen -> keine Linie.
      const segs: any[] = s.analysis?.segments ?? [];
      const lauf = segs.find((g) => typeof g?.i_start === "number" && typeof g?.i_end === "number"
                                    && i >= g.i_start && i <= g.i_end);
      if (lauf) {
        const bis = Math.min(Math.floor(i), lauf.i_end);
        for (let k = lauf.i_start; k < bis; k++) {
          const a = bahn.pts[k], b = bahn.pts[k + 1];
          if (!a || !b) continue;
          // Dieselbe Lueckenregel wie die statische Karte: ueber einen GPS-Aussetzer wird nicht
          // quer durch die Landschaft gezeichnet.
          if (mapObj.current && mapObj.current.distance(a, b) > MAX_DRAW_GAP_M) continue;
          L.polyline([a, b], { color: bahn.farbeAn(k + 1), weight: 4, opacity: 0.95 }).addTo(lg);
        }
      }

      const a = bahn.pts[Math.floor(i)], b = bahn.pts[Math.min(Math.ceil(i), bahn.pts.length - 1)];
      if (!a) continue;
      const f = i - Math.floor(i);
      const p: [number, number] = b ? [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] : a;
      L.circleMarker(p, { radius: 7, color: "#ffffff", weight: 2, fillColor: bahn.farbe, fillOpacity: 1 })
        .bindTooltip(bahn.name, { permanent: true, direction: "top", offset: [0, -8], className: "sync-tip" })
        .addTo(lg);
    }
  };

  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    if (!spielerLayer.current) spielerLayer.current = L.layerGroup().addTo(map);
    if (!plan) { spielerLayer.current.clearLayers(); return; }
    zeichneStand(posRef.current);
    if (!spielt) return;
    let raf = 0;
    let zuletzt = performance.now();
    const schritt = (jetzt: number) => {
      const dt = (jetzt - zuletzt) * tempo; zuletzt = jetzt;
      const neu = posRef.current + dt;
      if (neu >= plan.dauerMs) {
        posRef.current = plan.dauerMs; setPos(plan.dauerMs); zeichneStand(plan.dauerMs);
        setSpielt(false); return;
      }
      posRef.current = neu; setPos(neu); zeichneStand(neu);
      raf = requestAnimationFrame(schritt);
    };
    raf = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(raf);
  }, [plan, spielt, tempo, bahnen]);

  useEffect(() => {
    const map = mapObj.current;
    const lg = layer.current;
    if (!map || !lg) return;
    lg.clearLayers();
    // Waehrend der Wiedergabe zeichnet NUR der Abspieler. Laege die vollstaendige Strecke
    // darunter, waere der wachsende Lauf darin nicht zu erkennen — und genau das ist der Zweck.
    if (spielModus) return;
    for (const it of items) {
      const gj = it.session.analysis?.track_geojson;
      const segs = it.session.analysis?.segments ?? [];
      if (!gj || !segs.length) continue;
      const coords: [number, number][] = gj.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
      const speeds: number[] = gj.properties?.speeds?.[win] ?? gj.properties?.speeds_mps ?? [];
      const phz: (number | null)[] = gj.properties?.pump_hz ?? [];
      const hr: (number | null)[] = gj.properties?.hr ?? [];
      const opt = optimalKmhFor(it.session, weight) ?? 0;
      const ranges = it.runIdx != null && segs[it.runIdx] ? [{ seg: segs[it.runIdx], idx: it.runIdx }] : segs.map((seg: any, idx: number) => ({ seg, idx }));
      for (const { seg } of ranges) {
        for (let i = seg.i_start; i < seg.i_end; i++) {
          if (!coords[i] || !coords[i + 1]) continue;
          if (map.distance(coords[i], coords[i + 1]) > MAX_DRAW_GAP_M) continue;
          let color: string;
          if (mode === "rider") color = it.riderColor;
          else if (mode === "track") color = it.color;
          else if (mode === "speed") color = speedColor((speeds[i + 1] ?? 0) * 3.6, sLo, sHi);
          else if (mode === "optimal") color = optimalColor((speeds[i + 1] ?? 0) * 3.6, opt);
          else if (mode === "pump") { const v = phz[i + 1]; const [lo, hi] = pumpRange; color = v == null ? "#64748b" : rampColor((v - lo) / Math.max(hi - lo, 1e-6)); }
          else color = hrColor(hr[i + 1], hrRange);
          L.polyline([coords[i], coords[i + 1]], { color, weight: 4, opacity: 0.92 }).addTo(lg);
        }
      }
    }
  }, [items, mode, win, sLo, sHi, pumpRange, hrRange, weight, fullscreen, spielModus]);

  if (!items.some((it) => it.session.analysis?.track_geojson)) return null;

  return (
    <div
      className={fullscreen ? "fixed inset-0 z-[2000] flex flex-col bg-slate-950" : "mb-4"}
      style={fullscreen ? {
        paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)",
      } : undefined}
    >
      <div className={`flex flex-wrap items-center gap-2 ${fullscreen ? "shrink-0 p-2" : "mb-2"}`}>
        <span className="text-xs text-slate-400">{t("sd.coloring")}</span>
        {riders.size > 1 && <ModeBtn active={mode === "rider"} onClick={() => setMode("rider")}>{t("compare.colorRider")}</ModeBtn>}
        <ModeBtn active={mode === "track"} onClick={() => setMode("track")}>{t("compare.colorTrack")}</ModeBtn>
        <ModeBtn active={mode === "speed"} onClick={() => setMode("speed")}>{t("sd.colorSpeed")}</ModeBtn>
        {anyOptimal && <ModeBtn active={mode === "optimal"} onClick={() => setMode("optimal")}>{t("sd.colorOptimal")}</ModeBtn>}
        {hasPump && <ModeBtn active={mode === "pump"} onClick={() => setMode("pump")}>{t("sd.colorPumpHz")}</ModeBtn>}
        {hasHr && <ModeBtn active={mode === "hr"} onClick={() => setMode("hr")}>{t("sd.colorPulse")}</ModeBtn>}
        <button onClick={() => setFullscreen((v) => !v)} className="ml-auto rounded-lg bg-slate-800 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700">
          {fullscreen ? t("sd.close") : t("sd.fullscreen")}
        </button>
      </div>

      <div className={fullscreen ? "min-h-0 flex-1" : "overflow-hidden rounded-2xl border border-slate-800"}>
        <div ref={mapRef} style={{ width: "100%", height: fullscreen ? "100%" : "55vh", minHeight: fullscreen ? undefined : 300 }} />
      </div>

      {/* Synchron abspielen — nur wenn sich Sessions zeitlich ueberschneiden UND am gleichen
          Spot liegen. Die uebersprungene Leerlaufzeit steht dabei, sonst wundert man sich ueber
          eine „Wiedergabe" von 4 Minuten fuer zwei Stunden am Wasser. */}
      {plan && (
        <div className={`mt-2 rounded-xl border border-slate-800 bg-slate-900/60 p-2 ${fullscreen ? "shrink-0" : ""}`}>
          <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-slate-200">{t("compare.syncTitle")}</span>
            <span className="text-xs text-slate-400">
              {t("compare.syncWho", { n: String(plan.sessions.length) })}
            </span>
          </div>
          <p className="mb-2 text-xs text-slate-400">{t("compare.syncHint")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { if (posRef.current >= plan.dauerMs) { posRef.current = 0; setPos(0); } setSpielt((v) => !v); }}
              className="rounded-lg bg-brand-500 px-3 py-1 text-sm font-semibold text-slate-950 hover:bg-brand-400"
            >
              {spielt ? t("sd.pause") : t("sd.play")}
            </button>
            {[2, 8, 30].map((m) => (
              <button key={m} onClick={() => setTempo(m)}
                className={`rounded-lg px-2 py-1 text-xs ${tempo === m ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
                {m}×
              </button>
            ))}
            <span className="ml-1 tabular-nums text-sm text-slate-200">
              {fmtTime(new Date(plan.zuUhrzeit(pos)).toISOString(), plan.sessions[0].tz,
                       { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <span className="text-xs text-slate-500">
              {t("compare.syncSkipped", { min: String(Math.round(uebersprungenMin)) })}
            </span>
          </div>
          <input
            type="range" min={0} max={plan.dauerMs} step={200} value={pos}
            onChange={(e) => { const v = Number(e.target.value); posRef.current = v; setPos(v); zeichneStand(v); }}
            className="mt-2 w-full accent-brand-400"
            aria-label={t("compare.syncTitle")}
          />
        </div>
      )}

      <div className={`flex flex-wrap items-center gap-4 px-1 pt-2 ${fullscreen ? "shrink-0 bg-slate-950 p-2" : ""}`}>
        {(mode === "rider" || mode === "track") ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
            {mode === "rider"
              ? Array.from(new Map(items.map((it) => [it.rider ?? "?", it.riderColor])).entries()).map(([name, col]) => (
                  <span key={name} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded" style={{ backgroundColor: col }} />{name === "?" ? "—" : name}</span>
                ))
              : <span className="text-slate-400">{t("compare.colorTrackHint")}</span>}
          </div>
        ) : (
          <ValueLegend mode={mode} speedRange={[sLo, sHi]} pumpRange={pumpRange} hrRange={hrRange}
            optimal={items.map((it) => optimalKmhFor(it.session, weight)).find((v) => v != null) ?? null} />
        )}
        {mode === "speed" && (
          <span className="flex items-center gap-1 text-xs text-slate-300">
            <label className="mr-1 flex items-center gap-1"><input type="checkbox" checked={autoScale} onChange={(e) => setAutoScale(e.target.checked)} className="accent-brand-500" />{t("sd.auto")}</label>
            {t("sd.scale")}
            <input type="number" min={0} max={60} value={sLo} disabled={autoScale} onChange={(e) => { setAutoScale(false); setSLo(Number(e.target.value)); }} className="w-14 rounded bg-slate-800 px-2 py-1 text-slate-100 disabled:opacity-50" />
            –
            <input type="number" min={0} max={60} value={sHi} disabled={autoScale} onChange={(e) => { setAutoScale(false); setSHi(Number(e.target.value)); }} className="w-14 rounded bg-slate-800 px-2 py-1 text-slate-100 disabled:opacity-50" />
            km/h
          </span>
        )}
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-2.5 py-1 text-xs ${active ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
      {children}
    </button>
  );
}

function ValueLegend({ mode, speedRange, pumpRange, hrRange, optimal }: { mode: Mode; speedRange: [number, number]; pumpRange: [number, number]; hrRange: [number, number]; optimal: number | null }) {
  const t = useT();
  const pf = usePumpFmt();
  if (mode === "optimal") {
    const opt = optimal ?? 0;
    const ticks = [1 - OPTIMAL_SPAN, 1, 1 + OPTIMAL_SPAN].map((r) => Math.round(opt * r));
    return (
      <div className="text-xs text-slate-300"><div className="flex items-center gap-3">
        <div className="w-48"><div className="h-2 w-full rounded" style={{ background: "linear-gradient(to right, hsl(220,80%,48%), hsl(140,80%,48%), hsl(0,80%,48%))" }} />
          <div className="mt-1 flex w-full justify-between tabular-nums">{ticks.map((v, i) => <span key={i}>{v}</span>)}</div></div>
        <span>km/h</span><span className="text-slate-400">{t("sd.optimalLegend", { v: String(Math.round(opt)) })}</span>
      </div></div>
    );
  }
  const [lo, hi] = mode === "speed" ? speedRange : mode === "pump" ? pumpRange : hrRange;
  const unit = mode === "speed" ? "km/h" : mode === "pump" ? pf.suffix : "bpm";
  const ticksT = [0, 0.25, 0.5, 0.75, 1];
  const stops = ticksT.map((tt) => rampColor(tt)).join(", ");
  const ticks = ticksT.map((tt) => mode === "pump" ? pf.tick(lo + tt * (hi - lo)) : Math.round(lo + tt * (hi - lo)));
  return (
    <div className="text-xs text-slate-300"><div className="flex items-center gap-3">
      <div className="w-48"><div className="h-2 w-full rounded" style={{ background: `linear-gradient(to right, ${stops})` }} />
        <div className="mt-1 flex w-full justify-between tabular-nums">{ticks.map((v, i) => <span key={i}>{v}</span>)}</div></div>
      <span>{unit}</span>
    </div></div>
  );
}
