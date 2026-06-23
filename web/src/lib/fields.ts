// Gemeinsamer Datenfeld-Katalog (IDs identisch mit der Uhr/Config.mc).
// 0 = leer/aus. Nur Felder, die die Uhr in Echtzeit berechnen kann.
export const FIELD_OPTIONS: { id: number; label: string }[] = [
  { id: 0, label: "— leer —" },
  { id: 1, label: "Speed (3 s)" },
  { id: 5, label: "Speed (aktuell)" },
  { id: 6, label: "Ø Speed" },
  { id: 7, label: "Max Speed" },
  { id: 2, label: "Puls" },
  { id: 8, label: "Ø Puls" },
  { id: 9, label: "Max Puls" },
  { id: 3, label: "Zeit" },
  { id: 4, label: "Distanz" },
  { id: 10, label: "Höhe" },
  { id: 13, label: "Aufstieg" },
  { id: 11, label: "Temperatur" },
  { id: 12, label: "Uhrzeit" },
  // On-Watch-Lauferkennung (live)
  { id: 14, label: "Lauf Dauer (live)" },
  { id: 15, label: "Lauf Strecke (live)" },
  { id: 16, label: "Letzter Lauf: Dauer" },
  { id: 17, label: "Letzter Lauf: Strecke" },
  { id: 18, label: "Letzter Lauf: Ø Speed" },
  { id: 19, label: "Letzter Lauf: Max Speed" },
  { id: 20, label: "Läufe (Anzahl)" },
];

export function fieldLabel(id: number): string {
  return FIELD_OPTIONS.find((f) => f.id === id)?.label ?? "—";
}
