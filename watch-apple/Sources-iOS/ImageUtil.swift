import UIKit

// Bild vor dem Upload auf Web-Größe verkleinern (max 1920 px lange Kante, JPEG 0.85) — spart
// Upload-Zeit + Speicher. UIImage wendet die EXIF-Orientierung automatisch an; gerendert wird
// in Pixeln (Format-Scale 1). Bei Fehler/kein-Gewinn: Original-Data zurückgeben (nie schlechter).
func downscaleJPEG(_ data: Data, maxEdge: CGFloat = 1920, quality: CGFloat = 0.85) -> Data {
    guard let img = UIImage(data: data) else { return data }
    let pxW = img.size.width * img.scale
    let pxH = img.size.height * img.scale
    let longEdge = max(pxW, pxH)
    let ratio = longEdge > maxEdge ? maxEdge / longEdge : 1.0
    let target = CGSize(width: (pxW * ratio).rounded(), height: (pxH * ratio).rounded())

    let fmt = UIGraphicsImageRendererFormat.default()
    fmt.scale = 1   // Zielgröße in Pixeln, nicht Punkten
    fmt.opaque = true
    let resized = UIGraphicsImageRenderer(size: target, format: fmt).image { _ in
        img.draw(in: CGRect(origin: .zero, size: target))
    }
    guard let jpeg = resized.jpegData(compressionQuality: quality), jpeg.count < data.count else {
        return data   // kein Gewinn -> Original
    }
    return jpeg
}
