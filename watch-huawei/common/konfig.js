/*
 * Kennungen fuer die Verbindung Uhr <-> Handy (Wear Engine). EINZIGE Stelle im JS-Code; die
 * zweite ist `supportLists` in entry/src/main/config.json beider Projekte (gleicher Wert).
 *
 * PHONE_FP = SHA-256-Fingerabdruck des Signierschluessels der Android-App, so wie Huawei ihn
 * erwartet (AppGallery Connect zeigt ihn beim Wear-Engine-Antrag). Bei Play App Signing ist das
 * der Schluessel von GOOGLE, nicht der Upload-Schluessel (Play Console -> App-Integritaet).
 * Ohne passenden Wert meldet jede Uebertragung 206 (Wear-Engine-FAQ).
 */
var PHONE_PKG = "org.pumpfoil.app";
var PHONE_FP = "PHONE_FINGERPRINT_EINTRAGEN";
var APP_VERSION = "1.0.1";

export default { PHONE_PKG: PHONE_PKG, PHONE_FP: PHONE_FP, APP_VERSION: APP_VERSION };
