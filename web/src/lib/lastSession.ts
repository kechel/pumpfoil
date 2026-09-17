// Merkt sich die zuletzt geöffnete Session, damit die Sessions-Liste sie nach der
// Rückkehr aus der Detailansicht hervorheben kann. Nur im Speicher (überlebt
// Client-Navigation, bei echtem Reload zurückgesetzt) — passend zum Listen-Scroll-Cache.
let lastViewed: number | null = null;

export function setLastSession(id: number) {
  lastViewed = id;
}

export function getLastSession(): number | null {
  return lastViewed;
}

// Menü-Klick auf „Sessions" heißt: neu anfangen. Ohne Marker hebt die Liste nichts hervor und
// scrollt nirgendwohin, und ScrollToTop bringt die Seite wieder an den Anfang. Der Sprung zur
// zuletzt geöffneten Session bleibt dem Weg aus der Detailansicht zurück vorbehalten.
export function clearLastSession() {
  lastViewed = null;
}

// Volle Query der Sessions-Liste (scope/spot/filter/month), damit der Zurück-Link im
// Detail wieder in denselben Scope/Filter zurückführt statt auf die nackte Liste.
let lastSessionsSearch = "";

export function setLastSessionsSearch(search: string) {
  lastSessionsSearch = search;
}

export function getLastSessionsSearch(): string {
  return lastSessionsSearch;
}

// Filter der Liste, aus der man ins Detail gekommen ist — „älter/neuer" dort soll GENAU
// dieser Liste folgen (Jan, 17.09.2026: „wenn ich auf meine bin, mit nur Accel, dann auch
// bei meinen nur Accel die frühere … wenn ich aber an diesem Spot bin, die nächste an
// meinem Spot von allen Fahrern"). Absichtlich derselbe Merker-Ansatz wie beim Zurück-Link
// oben: wer das Detail über einen Rekord oder die Startseite betritt, hat keinen Listen-
// Kontext — dann bleibt es beim Standard (eigene Sessions), so wie bisher.
export type NachbarFilter = {
  scope?: "mine" | "all";
  spot?: string;
  sport?: string;
  accelOnly?: boolean;
  filter?: "pump" | "other";
  month?: string;
};

let lastFilter: NachbarFilter = {};

export function setLastSessionsFilter(f: NachbarFilter) {
  lastFilter = f;
}

export function getLastSessionsFilter(): NachbarFilter {
  return lastFilter;
}
