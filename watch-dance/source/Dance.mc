using Toybox.Application.Storage;
using Toybox.Lang;

// DANCE (Jan, 16.10.2026): Gyro-Puffer der Tanz-Variante. Eigenes Modul, weil SessionRecorder an der
// Grenze von 253 Mitgliedern steht. Format wie der Handy-Kreisel (docs/data-format.md, kind=gyro):
// int16 little-endian, [gx, gy, gz, ...], rad/s = raw / 1024. Connect IQ liefert Grad je Sekunde.
// Ein Gyro-Chunk wird genau dann geschrieben, wenn der Accel-Chunk geschrieben wird, mit demselben
// Index — so gelten seine t0/t1 auch fuer den Gyro.
module Dance {
    var gyroAn = false;
    var _buf = new [0]b;

    function reset() as Void { _buf = new [0]b; }

    function addGyro(g) as Void {
        if (g == null || g.x == null) { return; }
        var n = g.x.size();
        for (var i = 0; i < n; i++) {
            _i16(g.x[i]); _i16(g.y[i]); _i16(g.z[i]);
        }
    }

    // Grad/s -> rad/s * 1024, auf int16 begrenzt (+-32 rad/s, s. Vertrag).
    function _i16(dps) as Void {
        var v = (dps * 17.8711).toNumber();      // 1024 * pi / 180
        if (v > 32767) { v = 32767; } else if (v < -32768) { v = -32768; }
        if (v < 0) { v += 65536; }
        _buf.add(v & 0xFF);
        _buf.add((v >> 8) & 0xFF);
    }

    function drop() as Void { _buf = new [0]b; }

    function flush(uuid, idx) as Void {
        if (_buf.size() == 0) { return; }
        try { Storage.setValue("cy_" + uuid + "_" + idx, _buf); } catch (e) {}
        _buf = new [0]b;
    }
}
