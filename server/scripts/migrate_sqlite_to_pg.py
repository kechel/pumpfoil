#!/usr/bin/env python3
"""Einmalige Migration: SQLite -> PostgreSQL. Kopiert alle Tabellen (FK-Reihenfolge),
setzt die Sequenzen. Idempotent NICHT — Ziel sollte leer sein.

  SRC=sqlite:///./foil.sqlite3  DST=<pg-url>  python -m scripts.migrate_sqlite_to_pg
(ohne ENV: SRC=sqlite:///./foil.sqlite3, DST=DATABASE_URL)
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, func, insert, select, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.db import Base  # noqa: E402
import app.models  # noqa: E402,F401


def main() -> int:
    src_url = os.environ.get("SRC", "sqlite:///./foil.sqlite3")
    dst_url = os.environ.get("DST") or os.environ.get("DATABASE_URL")
    if not dst_url or not dst_url.startswith("postgresql"):
        raise SystemExit("DST/DATABASE_URL muss eine PostgreSQL-URL sein")
    src = create_engine(src_url)
    dst = create_engine(dst_url)
    print(f"Quelle: {src_url}\nZiel:   {dst_url.split('@')[-1]}")

    Base.metadata.create_all(dst)

    with src.connect() as sc, dst.begin() as dc:
        for table in Base.metadata.sorted_tables:  # Eltern zuerst (FK-sicher)
            rows = [dict(r) for r in sc.execute(select(table)).mappings().all()]
            if rows:
                dc.execute(insert(table), rows)
            print(f"  {table.name}: {len(rows)} Zeilen")
        # Sequenzen auf max(id) setzen (PostgreSQL)
        for table in Base.metadata.sorted_tables:
            if "id" in table.c:
                seq = dc.execute(text("SELECT pg_get_serial_sequence(:t, 'id')"),
                                 {"t": table.name}).scalar()
                if seq:
                    mx = dc.execute(select(func.max(table.c.id))).scalar() or 0
                    dc.execute(text("SELECT setval(:s, :v, true)"), {"s": seq, "v": max(mx, 1)})

    # Verifikation: Zeilenzahlen vergleichen
    print("\nVerifikation (Quelle == Ziel?):")
    ok = True
    with src.connect() as sc, dst.connect() as dc:
        for table in Base.metadata.sorted_tables:
            a = sc.execute(select(func.count()).select_from(table)).scalar()
            b = dc.execute(select(func.count()).select_from(table)).scalar()
            flag = "OK" if a == b else "!!! MISMATCH"
            if a != b:
                ok = False
            print(f"  {table.name}: {a} -> {b}  {flag}")
    print("\nERGEBNIS:", "alle Tabellen identisch ✓" if ok else "ABWEICHUNG — nicht umstellen!")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
