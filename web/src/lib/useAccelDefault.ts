import { useState } from "react";

// State für den accel|alle-Umschalter.
// VORERST: Default überall "alle" (accelOnly=false) — noch zu wenige Nutzer, um auf präzise
// Accel-Läufe einzuschränken. Der smarte Default (accel, wenn der Nutzer Accel-Daten hat)
// via /sessions/has-accel ist vorbereitet und kann später wieder aktiviert werden.
export function useAccelDefault(): [boolean, (v: boolean) => void] {
  const [accelOnly, setAccelOnly] = useState<boolean>(false);
  return [accelOnly, setAccelOnly];
}
