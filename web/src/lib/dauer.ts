// Laufdauer wie in der Session-Ansicht: m:ss, ab einer Stunde h:mm:ss. Vorher stand an sechs Stellen
// `${Math.floor(v / 60)}:${…}` — eine 6-h-Session (Nicolas_I, 04.10.2026) erschien in der Rekord-Kachel
// als „361:09". Ausserdem zuerst auf ganze Sekunden runden: sonst wurde aus 59,6 s „0:60".
export function fmtLaufDauer(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "–";
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(total % 60)}` : `${m}:${pad(total % 60)}`;
}

/** Mit Einheit: „6:01:09 h" bzw. „4:12 min". */
export function fmtLaufDauerEinheit(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "–";
  return `${fmtLaufDauer(s)} ${Math.round(s) >= 3600 ? "h" : "min"}`;
}
