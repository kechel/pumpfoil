/*
 * Attrappe der Wear Engine fuer den Simulator (Jan, 08.10.2026: Lite-Simulator blieb schwarz).
 * Im Simulator gibt es `@system.wearengine` nicht — schon der Import von wearengine.js scheitert,
 * bevor eine Zeile von uns laeuft. Mit `./sim.sh an` importiert die Seite diese Datei statt
 * der echten: Aufnahme und Datenseiten laufen, Senden scheitert sichtbar mit Code -2; Empfang geht ueber
 * das Simulator-Feld „Distributed Capability" (s. registerReceiver).
 * NIE fuer eine echte Uhr bauen — build-all.sh synct vorher und stellt den echten Import her.
 */
export function P2pClient() {}
P2pClient.prototype.setPeerPkgName = function () {};
P2pClient.prototype.setPeerFingerPrint = function () {};
// Empfang ueber das Feld „Distributed Capability" des Simulators: dort eingetippte Nachrichten kommen per
// FeatureAbility.subscribeMsg an — derselbe Weg, den wearengine.js auf Wear-Engine-Versionen < 401 nimmt.
// Testen: Message = PF1|k_konfig.json|0|1|1|{"views":[[1,2,3]],"layoutsOn":false}  -> Datenseiten wechseln.
P2pClient.prototype.registerReceiver = function (cb) {
  if (typeof FeatureAbility === "undefined" || !FeatureAbility.subscribeMsg) {
    console.info("Pumpfoil SIM: kein Empfang (FeatureAbility fehlt)");
    return;
  }
  FeatureAbility.subscribeMsg({
    success: function (d) {
      var m = d && d.message;
      console.info("Pumpfoil SIM: empfangen " + (typeof m === "string" ? m.substring(0, 60) : typeof m));
      if (m && cb && cb.onReceiveMessage) cb.onReceiveMessage(m);
    },
    fail: function (d, code) { console.info("Pumpfoil SIM: subscribeMsg fail " + code); }
  });
  console.info("Pumpfoil SIM: Empfang ueber Distributed Capability");
};
P2pClient.prototype.send = function (m, cb) {
  console.info("Pumpfoil SIM: senden -> Code -2");
  setTimeout(function () { if (cb && cb.onSendResult) cb.onSendResult({ code: -2 }); }, 200);
};
export function Message() {}
export function Builder() {}
Builder.prototype.setDescription = function () {};
