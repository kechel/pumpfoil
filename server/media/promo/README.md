# server/media/promo/ — oeffentliche Werbe-Grafiken

Was hier liegt, ist unter **`https://pumpfoil.org/promo/<datei>`** ohne Login erreichbar
(Route `promo_datei` in `server/app/main.py`). Gedacht zum Verlinken in Foren und Chats —
nirgends auf der Seite verlinkt, wie die Play-Belege unter `/demo/` auch.

**Dieser Ordner ist die Ausnahme in `server/media/`.** Alles andere dort ist Nutzerinhalt und
gehoert nicht ins Repo; diese paar Dateien schon, damit ein `git pull` auf der VM reicht —
`MEDIA_DIR` zeigt dort auf `server/media/`.

**Nur Standbilder** (`.png`, `.jpg`, `.webp`, `.svg`). Was hier landet, steht fuer immer in
der Git-Historie: ein Werbevideo gehoert deshalb von Hand auf die VM, nicht hier hinein.

**Die Endcards kommen aus `brand/master/`** und liegen als Original in `brand/social/`.
Wer sie dort neu erzeugt, muss sie hierher kopieren — es sind bewusst Kopien und keine
Symlinks: die Route loest den Pfad auf und weist alles ab, was aus dem Ordner hinauszeigt.

    cp brand/social/shorts-endcard-{dark,light}-1080x1920.png server/media/promo/

Die Adresse liefert `Cache-Control: max-age=86400` — eine ersetzte Datei ist also nach
spaetestens einem Tag ueberall neu, nicht erst nach den 90 Tagen des `/media`-Mounts.

## Was hier liegt

| Datei | Groesse | wofuer |
|---|---|---|
| `shorts-endcard-dark-1080x1920.png` | 1080 × 1920 | volle Aufloesung, Shorts-Format |
| `shorts-endcard-light-1080x1920.png` | 1080 × 1920 | dieselbe, helle Fassung |
| `shorts-endcard-dark-400x711.png` | 400 × 711 | fuers Forum: laedt sofort, passt in einen Beitrag |
| `shorts-endcard-light-400x711.png` | 400 × 711 | dieselbe, helle Fassung |

Die kleinen Fassungen sind aus den grossen herunterskaliert (Lanczos, `optimize=True`), also
rund 110 KB statt 375 KB bei gleichem Seitenverhaeltnis. Wer eine andere Breite braucht: aus der
1080er Fassung neu rechnen, nicht aus der 400er — zweimal skalieren kostet sichtbar Schaerfe.
