#!/usr/bin/env python3
"""Misst, wie lange der Server bei einem Neustart NICHT erreichbar ist.

    python3 scripts/restart-ausfall-messen.py            # nur messen, ohne Neustart
    python3 scripts/restart-ausfall-messen.py --restart   # Neustart ausloesen und messen

Unterscheidet die drei Faelle, die fuer den Nutzer voellig verschieden aussehen:
  * `refused`  — Port ist ZU. Der Apache davor macht daraus einen 502, und ohne `retry=0`
                 in der ProxyPass-Zeile bis zu 60 s lang (mod_proxy-Standard).
  * `wartet`   — Verbindung wird angenommen, Antwort dauert. Genau das liefert die
                 Socket-Aktivierung: aus Ausfall wird Verzoegerung.
  * `offen`    — normal beantwortet.

Nur lesend, ausser mit --restart.
"""
import argparse
import http.client
import socket
import subprocess
import sys
import time

HOST, PORT, PFAD = "127.0.0.1", 8090, "/api/app/news"


def messung() -> tuple[str, float]:
    """(Zustand, Dauer in s) einer einzelnen Anfrage."""
    t0 = time.time()
    try:
        c = http.client.HTTPConnection(HOST, PORT, timeout=15)
        c.request("GET", PFAD)
        r = c.getresponse()
        r.read()
        c.close()
        d = time.time() - t0
        return ("offen" if d < 0.5 else "wartet", d)
    except ConnectionRefusedError:
        return ("refused", time.time() - t0)
    except (socket.timeout, TimeoutError):
        return ("timeout", time.time() - t0)
    except OSError as e:
        return (f"fehler:{type(e).__name__}", time.time() - t0)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--restart", action="store_true", help="Neustart ausloesen (SCHREIBEND)")
    ap.add_argument("--dauer", type=float, default=25.0, help="Beobachtungsfenster in Sekunden")
    args = ap.parse_args()

    z, d = messung()
    print(f"vorher: {z} ({d * 1000:.0f} ms)", flush=True)
    if not z.startswith(("offen", "wartet")):
        sys.exit("Server antwortet schon vorher nicht — Messung sinnlos.")
    if not args.restart:
        print("(ohne --restart wird nichts angefasst)")
        return

    t0 = time.time()
    subprocess.Popen(["sudo", "systemctl", "restart", "foil-server"])
    verlauf, letzter, max_wart = [], None, 0.0
    while time.time() - t0 < args.dauer:
        z, d = messung()
        if z == "wartet":
            max_wart = max(max_wart, d)
        if z != letzter:
            verlauf.append((time.time() - t0, z, d))
            letzter = z
        time.sleep(0.02)

    print("\nZustandswechsel (Sekunden ab Neustart-Befehl):")
    for t, z, d in verlauf:
        print(f"   {t:6.2f}s  {z:8} ({d * 1000:.0f} ms)")
    schlecht = [t for t, z, _ in verlauf if z not in ("offen", "wartet")]
    gut = [t for t, z, _ in verlauf if z == "offen"]
    if schlecht and gut and gut[-1] > schlecht[0]:
        print(f"\n=> {gut[-1] - schlecht[0]:.2f} s NICHT erreichbar (Nutzer sieht 502)")
    else:
        print("\n=> kein Ausfall: Verbindungen wurden immer angenommen")
    if max_wart:
        print(f"=> laengste einzelne Wartezeit: {max_wart:.2f} s (Verzoegerung, kein Fehler)")


if __name__ == "__main__":
    main()
