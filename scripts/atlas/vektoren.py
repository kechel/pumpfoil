#!/usr/bin/env python3
"""Vektoren fuer den Projekt-Atlas: aehnliche Themen finden, auch ueber Sprachen und Schreibweisen hinweg.

Laeuft in der eigenen venv ~/pumpfoil-atlas/venv (fastembed + onnxruntime, kein torch). Modell:
paraphrase-multilingual-MiniLM-L12-v2 (384 Dimensionen, 0,2 GB, deutsch und englisch im selben Raum).

Ein Vektor je Abschnitt, geschluesselt nach Inhalts-Hash `h`: unveraenderte Abschnitte werden nie neu
gerechnet, auch nicht nach `bauen.py --neu`. Gesucht wird per Skalarprodukt ueber alle (ein paar zehntausend,
das dauert Millisekunden) — ein eigener Vektor-Datenbank-Server bringt bei dieser Groesse nichts.

Einrichten: python3 -m venv ~/pumpfoil-atlas/venv && ~/pumpfoil-atlas/venv/bin/pip install fastembed
"""
from __future__ import annotations

import os
import sqlite3
import sys
import time
from pathlib import Path

import numpy as np

DB = Path(os.environ.get("ATLAS_DB", Path.home() / "pumpfoil-atlas" / "atlas.db"))
MODELL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
# Mehrbenutzer-VM: nicht alle Kerne belegen.
THREADS = 6


def modell():
    from fastembed import TextEmbedding
    return TextEmbedding(MODELL, cache_dir=str(DB.parent / "modelle"), threads=THREADS)


def text_fuer_vektor(titel: str, text: str) -> str:
    # Das Modell sieht ohnehin nur ~128 Token; Titel zuerst, er traegt das Thema.
    return f"{titel}\n{text[:700]}"


def normiert(v: np.ndarray) -> np.ndarray:
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def main(leise: bool) -> None:
    db = sqlite3.connect(DB, timeout=60)
    db.execute("CREATE TABLE IF NOT EXISTS vektoren (h TEXT PRIMARY KEY, v BLOB)")
    fehlend = db.execute("""SELECT DISTINCT s.h, s.titel, s.text FROM stuecke s
                            LEFT JOIN vektoren v ON v.h = s.h WHERE v.h IS NULL""").fetchall()
    if fehlend:
        t0 = time.time()
        m = modell()
        for i in range(0, len(fehlend), 256):
            block = fehlend[i:i + 256]
            vs = normiert(np.array(list(m.embed([text_fuer_vektor(t, x) for _, t, x in block])), dtype=np.float32))
            db.executemany("INSERT OR REPLACE INTO vektoren VALUES (?, ?)",
                           [(h, v.astype(np.float16).tobytes()) for (h, _, _), v in zip(block, vs)])
            db.commit()
        if not leise:
            print(f"atlas: {len(fehlend)} Vektoren gerechnet, {time.time() - t0:.0f} s")
    # Vektoren ohne Abschnitt wegraeumen
    db.execute("DELETE FROM vektoren WHERE h NOT IN (SELECT h FROM stuecke)")
    db.commit()
    db.close()


if __name__ == "__main__":
    main("--leise" in sys.argv)
