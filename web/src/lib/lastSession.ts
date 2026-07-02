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
