import { useEffect, useState } from "react";
import { api } from "./api";

// Session-weiter Cache: has-accel nur einmal laden.
let cache: boolean | null = null;
let inflight: Promise<boolean> | null = null;

function loadHasAccel(): Promise<boolean> {
  if (cache !== null) return Promise.resolve(cache);
  if (!inflight) {
    inflight = api.hasAccel()
      .then((r) => { cache = r.has_accel; return cache; })
      .catch(() => { cache = false; return false; });
  }
  return inflight;
}

// State für den accel|alle-Umschalter. Sobald der Nutzer selbst umschaltet, bleibt seine Wahl
// (kein Überschreiben mehr). Rückgabe: [accelOnly, setAccelOnly, setAuto, resetAuto].
//
// `smart = true` (Default): „nur accel", wenn der anschauende Nutzer selbst Accel-Daten in seinen
// Läufen hat, sonst „alle". Das ist richtig für Rekorde/Bestenlisten, wo Präzision zählt.
//
// `smart = false`: IMMER mit „alle" starten, auch wenn der Nutzer Accel-Daten hat — und ohne die
// has-accel-Abfrage. So starten seit 31.08. die Sessions-Listen (Meine / je Spot / Alle, Jans
// Vorgabe): dort ist die Liste eine Übersicht, und „nur präzise" verschweigt still die Sessions
// der Mitfahrer, deren Uhr keine verwertbaren Beschleunigungsdaten liefert. Genau daran ist am
// 29.08. ein Nutzer hängengeblieben („14 Sessions am Spot, nach dem Klick stehen drei da").
export function useAccelDefault(smart = true): [boolean, (v: boolean) => void, (v: boolean) => void, () => void] {
  const start = smart ? (cache ?? true) : false;
  const [accelOnly, setAccelOnly] = useState<boolean>(start);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!smart || touched) return;
    loadHasAccel().then((hasAccel) => { if (!touched) setAccelOnly(hasAccel); });
  }, [touched, smart]);
  const set = (v: boolean) => { setTouched(true); setAccelOnly(v); };
  // setAuto: die Ansicht schaltet selbst um (z. B. Spot ohne eine einzige Session mit
  // Beschleunigungsdaten -> sonst stünde man vor einer leeren Liste). Bewusst OHNE `touched`,
  // damit das NICHT als Nutzer-Wahl gilt: verlässt man den Spot, greift wieder der Default
  // aus der eigenen Uhr. resetAuto stellt genau den wieder her, solange nichts angetippt wurde.
  const setAuto = (v: boolean) => { if (!touched) setAccelOnly(v); };
  const resetAuto = () => { if (!touched) setAccelOnly(smart ? (cache ?? true) : false); };
  return [accelOnly, set, setAuto, resetAuto];
}
