// Gemeinsamer Zustand der Attrappen: Dateien der Uhr, angemeldete Sensoren, Protokoll.
// Rueckrufe kommen wie auf der Uhr ASYNCHRON (Mikrotask), nie im selben Aufruf.
export const uhr = {
  dateien: new Map(),        // uri -> text
  geschrieben: new Map(),    // uri -> zuletzt geschriebener Text (bleibt nach dem Loeschen)
  accel: null, puls: null, gps: null,
  bildschirm: false,
};
export const spaeter = (fn) => queueMicrotask(fn);
