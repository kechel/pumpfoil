/*
 * Der Recorder lebt im app.js-Buendel, die Seite holt ihn per getApp().R (Jan, 08.10.2026: Lite-Seite
 * blieb schwarz). JerryScript der Lite-Uhren uebersetzt jedes Buendel in 48 KB Heap — Recorder, Kern,
 * Wear Engine UND Datenseiten in einem Seiten-Buendel passten nicht, der Snapshot scheiterte. Getrennt
 * passt jedes Buendel; nebenbei lebt der Recorder so so lange wie die App, nicht wie die Seite.
 */
import R from "./common/recorder.js";

export default {
  R: R,
  onCreate() {
    console.info("Pumpfoil onCreate");
  },
  onDestroy() {
    console.info("Pumpfoil onDestroy");
  }
};
