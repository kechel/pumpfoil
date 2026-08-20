#!/usr/bin/env python3
"""
yt-add-language.py — eine Sprache in den Caption-Caches NACHTRAGEN.

Ergänzt fehlende Titel/Beschreibungen für eine Sprache, ohne die vorhandenen
Texte anzufassen. Gebündelt: ein Claude-Aufruf übersetzt mehrere Videos.

Aufruf:  python3 scripts/yt-add-language.py pl [--batch 12] [--dry-run]

Danach pushen:  echo '{}' > .yt-batch-progress.json
                python3 scripts/yt-batch-localize.py --workers 10
"""

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("sm", HERE / "shorts-musik.py")
sm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sm)

NAMES = {"pl": "Polnisch", "cs": "Tschechisch", "id": "Bahasa Indonesia",
         "pt": "brasilianisches Portugiesisch", "tr": "Türkisch",
         "vi": "Vietnamesisch", "ar": "modernes Standardarabisch"}
# Bei Rechts-nach-links-Schrift steht das lateinische "NNN Pumpfoil JJJJ" davor
# hässlich im Weg. Die Nummer wird nur für unsere Zuordnung gebraucht, und die
# läuft über den deutschen Haupttitel — die Lokalisierung darf also frei sein.
RTL = {"ar"}


def ask(lang: str, items: list) -> dict:
    """items: [(key, titel_de, text_de, prefix)] -> {key: {title, description}}"""
    zeilen = "\n".join(
        f'{i}. prefix="{p}" | titel="{t}" | text="{d}"'
        for i, (_, t, d, p) in enumerate(items, 1))
    titel_regel = ("""- title: NUR der übersetzte Titel, KEIN Nummern-Präfix davor (die Schrift läuft
  von rechts nach links, lateinische Ziffern am Anfang stören das Bild).
  Hänge am Ende " | Pumpfoil" an. Max. 100 Zeichen gesamt."""
                   if lang in RTL else
                   """- title beginnt EXAKT mit dem angegebenen prefix (unübersetzt!), danach der
  übersetzte Titel. Max. 100 Zeichen gesamt.""")
    prompt = f"""Übersetze für den Pumpfoil-Kanal pumpfoil.org ins {NAMES.get(lang, lang)}.

Antworte AUSSCHLIESSLICH mit gültigem JSON (keine Code-Fences):
{{"1": {{"title": "...", "description": "..."}}, "2": {{...}}, ...}}

Regeln:
{titel_regel}
- "Pumpfoil" wird NIE übersetzt (Markenname).
- description: gleiche Aussage, natürlich formuliert, keine Wort-für-Wort-
  Übersetzung. Emojis übernehmen. KEINE Hashtags.
- Fachbegriffe: die Tragfläche heißt "foil"/"hydrofoil", NIE "wing" allein
  ("wing" ist im Foilsport das Segel in der Luft = andere Sportart).
  "front wing"/"Frontflügel" und "stabilizer"/"Stabi" sind korrekt.

Videos:
{zeilen}
"""
    env = {"HOME": str(Path.home()), "USER": Path.home().name,
           "PATH": "/opt/homebrew/bin:/usr/bin:/bin:" + str(Path.home() / ".local/bin")}
    proc = subprocess.run([sm.CLAUDE_BIN, "--model", sm.CLAUDE_MODEL, "-p", prompt],
                          capture_output=True, text=True, timeout=600, env=env)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout)[-300:])
    out = proc.stdout.strip()
    a, b = out.find("{"), out.rfind("}")
    d = json.loads(out[a:b + 1])
    return {items[int(k) - 1][0]: v for k, v in d.items() if k.isdigit()
            and 1 <= int(k) <= len(items)}


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    lang = sys.argv[1]
    size = int(sys.argv[sys.argv.index("--batch") + 1]) if "--batch" in sys.argv else 12
    dry = "--dry-run" in sys.argv

    cache_p = sm.YT_BATCH_CACHE_FILE
    cache = json.loads(cache_p.read_text())
    prog = json.loads(sm.YT_BATCH_PROGRESS_FILE.read_text())

    offen = []
    for vid, caps in cache.items():
        if (caps.get("titles") or {}).get(lang):
            continue
        de_t = (caps.get("titles") or {}).get("de")
        de_d = (caps.get("descriptions") or {}).get("de")
        if not (de_t and de_d):
            continue
        titel = str(prog.get(vid, {}).get("title", de_t))
        m = sm.NUM_TITLE_RE.match(titel)
        prefix = f"{m.group(1)} Pumpfoil 2026" if m else ""
        # den Prefix aus dem de-Titel herausnehmen, damit nur der Titeltext übersetzt wird
        rein = de_t[len(prefix):].strip() if prefix and de_t.startswith(prefix) else de_t
        offen.append((vid, rein, de_d, prefix))

    print(f"{len(cache)} Videos im Cache, {len(offen)} ohne {lang}-Text")
    if dry or not offen:
        for v in offen[:5]:
            print("   ", v[3], "|", v[1][:50])
        return

    fertig = 0
    for i in range(0, len(offen), size):
        block = offen[i:i + size]
        try:
            res = ask(lang, block)
        except Exception as e:                                  # noqa: BLE001
            print(f"  ✗ Block {i // size + 1}: {str(e)[:150]}")
            continue
        for vid, v in res.items():
            if not (v.get("title") and v.get("description")):
                continue
            cache[vid].setdefault("titles", {})[lang] = v["title"][:100]
            cache[vid].setdefault("descriptions", {})[lang] = v["description"]
            fertig += 1
        cache_p.write_text(json.dumps(cache, ensure_ascii=False))
        print(f"  ✓ Block {i // size + 1}: {len(res)} übersetzt  (gesamt {fertig})")
    print(f"\n{fertig} Videos um {lang} ergänzt. Zum Pushen:")
    print("  echo '{}' > .yt-batch-progress.json && "
          "python3 scripts/yt-batch-localize.py --workers 10")


if __name__ == "__main__":
    main()
