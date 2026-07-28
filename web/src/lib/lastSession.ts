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
