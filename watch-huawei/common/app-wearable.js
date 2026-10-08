/*
 * Der Recorder lebt im app.js-Buendel, die Seite holt ihn per getApp().R (Jan, 08.10.2026: Lite-Seite
 * blieb schwarz). JerryScript der Lite-Uhren uebersetzt jedes Buendel in 48 KB Heap — Recorder, Kern,
 * Wear Engine UND Datenseiten in einem Seiten-Buendel passten nicht, der Snapshot scheiterte. Getrennt
 * passt jedes Buendel; nebenbei lebt der Recorder so so lange wie die App, nicht wie die Seite.
 */
import R from "./common/recorder.js";
// Nur Watch 3/4 (dieses Buendel kopiert sync-common.sh als wearable/…/app.js): Direkt-Upload ohne Handy.
// Lite hat kein Netz und keinen Platz dafuer — dort steht die Lite-app.js ohne diese Zeilen.
import D from "./common/direkt.js";

D.an(R);

export default {
  R: R,
  // Auch unter data: ob Lite-getApp() nur `data` herausgibt, ist offen (Simulator: getApp().R fehlte).
  data: { R: R },
  onCreate() {
    console.info("Pumpfoil onCreate");
  },
  onDestroy() {
    console.info("Pumpfoil onDestroy");
  }
};
