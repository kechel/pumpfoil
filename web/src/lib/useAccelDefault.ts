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

// State für den accel|alle-Umschalter mit smartem Default: „accel", wenn der anschauende
// Nutzer Accel-Daten in seinen Läufen hat, sonst „alle". Sobald der Nutzer selbst umschaltet,
// bleibt seine Wahl (kein Überschreiben mehr). Rückgabe: [accelOnly, setAccelOnly].
export function useAccelDefault(): [boolean, (v: boolean) => void, (v: boolean) => void, () => void] {
  const [accelOnly, setAccelOnly] = useState<boolean>(cache ?? true);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched) return;
    loadHasAccel().then((hasAccel) => { if (!touched) setAccelOnly(hasAccel); });
  }, [touched]);
  const set = (v: boolean) => { setTouched(true); setAccelOnly(v); };
  // setAuto: die Ansicht schaltet selbst um (z. B. Spot ohne eine einzige Session mit
  // Beschleunigungsdaten -> sonst stünde man vor einer leeren Liste). Bewusst OHNE `touched`,
  // damit das NICHT als Nutzer-Wahl gilt: verlässt man den Spot, greift wieder der Default
  // aus der eigenen Uhr. resetAuto stellt genau den wieder her, solange nichts angetippt wurde.
  const setAuto = (v: boolean) => { if (!touched) setAccelOnly(v); };
  const resetAuto = () => { if (!touched) setAccelOnly(cache ?? true); };
  return [accelOnly, set, setAuto, resetAuto];
}
