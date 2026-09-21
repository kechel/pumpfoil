import { useEffect, useRef } from "react";

/**
 * Ruft `tun()` auf, wenn die Seite aus dem Hintergrund zurueckkommt.
 *
 * WARUM NICHT NUR `visibilitychange`: das reicht fuer den Tab-Wechsel, aber nicht fuer den Fall,
 * den Jan am 21.09.2026 gemeldet hat — „wenn die PWA laenger schon auf ist, Laptop mal zugeklappt
 * war, und dann wieder reingehe". Beim Zuklappen schlaeft das ganze System ein; beim Aufwachen
 * ist das Dokument oft durchgehend `visible` gewesen, und es feuert KEIN `visibilitychange`.
 * Deshalb zusaetzlich:
 *   - `focus`   — das Fenster bekommt den Fokus zurueck (Laptop auf, Fenster gewechselt)
 *   - `pageshow` mit `persisted` — Rueckkehr aus dem Back/Forward-Cache (iOS-Safari/PWA)
 *   - `online`  — Netz ist wieder da; vorher konnte ohnehin nichts nachgeladen werden
 *
 * `mindestAbstandMs` verhindert, dass drei gleichzeitig feuernde Ereignisse drei Abfragen
 * ausloesen — und dass ein kurzer Tab-Wechsel hin und zurueck staendig nachlaedt.
 */
export function useWiederAufwachen(tun: () => void, mindestAbstandMs = 20_000): void {
  const tunRef = useRef(tun);
  tunRef.current = tun;
  const zuletzt = useRef(0);

  useEffect(() => {
    const ausloesen = () => {
      const jetzt = Date.now();
      if (jetzt - zuletzt.current < mindestAbstandMs) return;
      zuletzt.current = jetzt;
      tunRef.current();
    };
    const beiSichtbarkeit = () => { if (document.visibilityState === "visible") ausloesen(); };
    const beiPageshow = (e: PageTransitionEvent) => { if (e.persisted) ausloesen(); };
    document.addEventListener("visibilitychange", beiSichtbarkeit);
    window.addEventListener("focus", ausloesen);
    window.addEventListener("online", ausloesen);
    window.addEventListener("pageshow", beiPageshow);
    return () => {
      document.removeEventListener("visibilitychange", beiSichtbarkeit);
      window.removeEventListener("focus", ausloesen);
      window.removeEventListener("online", ausloesen);
      window.removeEventListener("pageshow", beiPageshow);
    };
  }, [mindestAbstandMs]);
}
