/*
 * Attrappe der Wear Engine fuer den Simulator (Jan, 08.10.2026: Lite-Simulator blieb schwarz).
 * Im Simulator gibt es `@system.wearengine` nicht — schon der Import von wearengine.js scheitert,
 * bevor eine Zeile von uns laeuft. Mit `./sim.sh an` importiert recorder.js diese Datei statt
 * der echten: Aufnahme und Datenseiten laufen, Senden scheitert sichtbar mit Code -2.
 * NIE fuer eine echte Uhr bauen — build-all.sh synct vorher und stellt den echten Import her.
 */
export function P2pClient() {}
P2pClient.prototype.setPeerPkgName = function () {};
P2pClient.prototype.setPeerFingerPrint = function () {};
P2pClient.prototype.registerReceiver = function () { console.info("Pumpfoil SIM: kein Empfang"); };
P2pClient.prototype.send = function (m, cb) {
  console.info("Pumpfoil SIM: senden -> Code -2");
  setTimeout(function () { if (cb && cb.onSendResult) cb.onSendResult({ code: -2 }); }, 200);
};
export function Message() {}
export function Builder() {}
Builder.prototype.setDescription = function () {};
