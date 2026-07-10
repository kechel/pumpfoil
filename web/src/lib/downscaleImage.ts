// Bild clientseitig auf Web-Größe verkleinern, bevor es hochgeladen wird — spart Upload-Zeit
// und Speicher. Handy-Fotos sind oft 3000–4000 px / mehrere MB; für die Web-Anzeige (max ~
// Vollbild-Lightbox) reichen ~1920 px lange Kante bei JPEG-Qualität 0.85 locker.
// EXIF-Orientierung wird über imageOrientation:"from-image" berücksichtigt (kein Rotations-Bug).
// Bei Fehlern/kein-Gewinn: Original zurückgeben (nie schlechter als vorher).
export async function downscaleImage(file: File, maxEdge = 1920, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;   // Format nicht dekodierbar (z. B. manche HEIC) -> Original hochladen
  }
  const { width, height } = bmp;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale >= 1) { bmp.close?.(); return file; }   // schon klein genug
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bmp.close?.(); return file; }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!blob || blob.size >= file.size) return file;   // kein Gewinn -> Original
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
