/**
 * Beschriftung des Aufnahme-Geraets fuer Kacheln, Listen und die Detailansicht.
 *
 * Das Grundwort kommt aus `device_label` und steht so in der Datenbank (Token-Beschriftung der
 * Uhr bzw. „Phone" beim Handy-Recorder) — es wird NICHT uebersetzt. Ergaenzt wird nur, WO das
 * Geraet bei der Aufnahme war, und das ist uebersetzt.
 *
 * Jan, 21.09.2026: „in den ganzen Session-Kacheln/Listen wo die Uhr oder eben Phone steht, bei
 * mit Phone on Board bitte entsprechend auch Phone on Board schreiben." Nur `board` bekommt den
 * Zusatz: `phone` heisst „am Koerper/in der Tasche" und ist der Normalfall des Handy-Recorders,
 * bei einer Uhr ist `placement` leer.
 */
export function geraeteText(
  deviceLabel: string | null | undefined,
  placement: string | null | undefined,
  t: (key: string) => string,
): string | null {
  if (!deviceLabel) return null;
  return placement === "board" ? `${deviceLabel} · ${t("session.onBoard")}` : deviceLabel;
}
