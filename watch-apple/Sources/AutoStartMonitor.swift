import Foundation
import CoreLocation

// Idle-GPS-Monitor für den Auto-Start (wie Garmin): löst aus, wenn die Geschwindigkeit
// ≥10 km/h für 4 aufeinanderfolgende Fixes hält. Eigener CLLocationManager + Delegate,
// damit der Aufnahme-Standortpfad des Recorders unberührt bleibt. Foreground-only.
final class AutoStartMonitor: NSObject, CLLocationManagerDelegate {
    private let loc = CLLocationManager()
    private var streak = 0
    private var onTrigger: (() -> Void)?

    func arm(_ trigger: @escaping () -> Void) {
        onTrigger = trigger
        streak = 0
        loc.delegate = self
        loc.desiredAccuracy = kCLLocationAccuracyBest
        loc.requestWhenInUseAuthorization()
        loc.startUpdatingLocation()
    }

    func disarm() {
        loc.stopUpdatingLocation()
        onTrigger = nil
        streak = 0
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let spMps = max(0, locations.last?.speed ?? 0)
        if spMps * 3.6 >= 10 {
            streak += 1
            if streak >= 4 {
                let t = onTrigger
                disarm()
                t?()
            }
        } else {
            streak = 0
        }
    }
}
