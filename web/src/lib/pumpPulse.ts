/**
 * Wann eine Zahl in der Community-Leiste pulsiert.
 *
 * Jan, 23.09.2026: „die anzahl pumps 'pulsiert' oder so, sobald die 1.000.000 erreicht ist" —
 * am 24.09. erweitert auf Foiler und Spots, dort ab 1.000.
 *
 * DIE ABSCHALT-REGEL kam aus seiner Rueckfrage („abschalten des pulses haben wir da schon eine
 * regel fuer?" — hatten wir nicht, es haette ab der Million FUER IMMER gepulst) und ist seine:
 * „puls bei 1000-1100 fuer nutzer und spots, und 1000000-1100000 bei pumps". Also ein FENSTER
 * ueber der Stufe, zehn Prozent breit.
 *
 * Das ist besser als mein erster Entwurf, der sieben Tage ab dem ersten Sehen zaehlte und sich
 * das je Betrachter im localStorage merkte: diese Regel braucht keinen Merker, kein Zeitrechnen
 * und keine Sonderbehandlung fuer private Fenster. Sie steht in der Zahl selbst — wer sie sieht,
 * sieht denselben Zustand wie alle anderen, und sie erlischt, wenn die Gemeinschaft zehn Prozent
 * weiter gewachsen ist.
 *
 * JEDE STUFE ZAEHLT: das Fenster liegt ueber der jeweils erreichten Stufe, nicht nur ueber der
 * ersten. Die zweite Million pulst also wieder, von 2.000.000 bis 2.200.000.
 *
 * KEIN ADMIN-SONDERFALL MEHR. Es gab einen, damit Jan den Effekt vor dem grossen Moment
 * ansehen konnte; nachdem er das getan hatte: „fuer Admins jetzt wieder ausschalten, sehe ich
 * dann ja, wenn es wirklich losgeht." Damit faellt auch der Profil-Abruf weg, den die Leiste
 * nur dafuer gebraucht hat — die Regel haengt jetzt an nichts als der Zahl.
 */
export const MEILENSTEIN_PUMPS = 1_000_000;
export const MEILENSTEIN_LEUTE = 1_000;      // Foiler und Spots
const FENSTER = 0.1;                          // zehn Prozent ueber der Stufe

/** Liegt der Wert im Feier-Fenster ueber einer erreichten Stufe? */
export function imMeilensteinFenster(wert: number | null | undefined, stufe: number): boolean {
  if (wert == null || wert < stufe) return false;
  const erreicht = Math.floor(wert / stufe) * stufe;
  return wert < erreicht * (1 + FENSTER);
}
