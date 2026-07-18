// Uhrzeiten/Daten in der ORTSZEIT DES SPOTS anzeigen — der Server liefert je Session die
// IANA-Zeitzone (`tz`, aus den Spot-Koordinaten). Eine 6-Uhr-Session in Helsinki erscheint
// damit überall als 06:00, egal von wo man schaut. Fallback: Browser-Zeitzone (tz fehlt/ungültig).

export function fmtTime(
  iso: string,
  tz?: string | null,
  opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string {
  const d = new Date(iso);
  try {
    return d.toLocaleTimeString(undefined, { ...opts, timeZone: tz ?? undefined });
  } catch {
    return d.toLocaleTimeString(undefined, opts);
  }
}

export function fmtDate(iso: string, tz?: string | null, opts?: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  try {
    return d.toLocaleDateString(undefined, { ...opts, timeZone: tz ?? undefined });
  } catch {
    return d.toLocaleDateString(undefined, opts);
  }
}
