#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Store-Texte fuer den Zepp-Store erzeugen — 17 Sprachen x 4 Felder, mit Laengenpruefung.

    python3 scripts/zepp-store-texte.py            # prueft und zeigt die Laengen
    python3 scripts/zepp-store-texte.py --echt     # schreibt die CSV

WARUM ES DAS GIBT: der Zepp-Store will App Name, App Introduction, App Details und New Version
Introduction JE SPRACHE — bei 17 Sprachen sind das 68 Felder. Bis zum 13.09.2026 lagen diese
Texte nirgends; sie wurden bei jeder Einreichung neu erfunden und waren danach wieder weg.

GRENZEN (Jan aus der Zepp-Konsole, 13.09.2026): 30 / 40 / 600 / 100 Zeichen. Das Skript BRICHT AB,
wenn ein Text zu lang ist, statt ihn abzuschneiden — ein halber Satz im Store ist schlimmer als
ein Skript, das meckert. Beim ersten Lauf hat genau das den franzoesischen Details-Text erwischt
(608 statt 600).

Die Sprachliste ist die der UHR-APP (`watch-zepp/page/index.js`, `LANGS`), nicht die der Website:
die Uhr kann 17 Sprachen, die Website 18 — Portugiesisch (Portugal) gibt es auf der Uhr nicht.
"""
import argparse
import csv
import pathlib
import sys

GRENZE = {"app_name": 30, "app_introduction": 40, "app_details": 600, "new_version_introduction": 100}
NAME = "Pumpfoil"      # Markenname, in jeder Sprache gleich

# code: (Sprache englisch, Introduction, Details, New Version Introduction)
TEXTE = {
 "en": ("English", "Pump foil recorder for pumpfoil.org",
  "Pumpfoil turns your watch into a recorder for pump foiling. It records your GPS track, your heart rate and the motion of your arm, then sends everything to pumpfoil.org, where your runs, pumps and glide phases are detected automatically.\n\nWhile you ride you see speed, heart rate and pump cadence — as numbers or as bars, in the colours of your own zones. A touch lock stops splashes from changing anything. Recordings stay on the watch until they have been transferred, so a lost connection costs you nothing.\n\nFree, no advertising, no tracking.",
  "Fixed: a button press or a swipe could close the app and end your recording."),
 "de": ("German", "Pumpfoil-Recorder für pumpfoil.org",
  "Pumpfoil macht deine Uhr zum Aufnahmegerät fürs Pumpfoilen. Sie zeichnet GPS-Spur, Puls und die Bewegung deines Arms auf und schickt alles an pumpfoil.org, wo Läufe, Pumps und Gleitphasen automatisch erkannt werden.\n\nWährend der Fahrt siehst du Tempo, Puls und Pump-Kadenz — als Zahl oder als Balken, in den Farben deiner eigenen Zonen. Eine Touch-Sperre verhindert, dass Spritzwasser etwas verstellt. Aufnahmen bleiben auf der Uhr, bis sie übertragen sind; eine abgerissene Verbindung kostet dich also nichts.\n\nKostenlos, ohne Werbung, ohne Tracking.",
  "Behoben: Tastendruck oder Wischen konnte die App und damit die Aufnahme beenden."),
 "gsw": ("Swiss German", "Pumpfoil-Recorder für pumpfoil.org",
  "Pumpfoil macht dini Uhr zum Ufnahmgrät fürs Pumpfoile. Si zeichnet GPS-Spur, Puls und d Bewegig vo dim Arm uf und schickt alles a pumpfoil.org, wo Läuf, Pumps und Gleitphase automatisch erkennt werded.\n\nWährend de Fahrt gsehsch Tempo, Puls und Pump-Kadänz — als Zahl oder als Balke, i de Farbe vo dine eigene Zone. E Touch-Sperr verhinderet, dass Spritzwasser öppis verstellt. Ufnahme bliibed uf de Uhr, bis si übertreit sind; e abgrissni Verbindig choschtet di also nüt.\n\nGratis, ohni Werbig, ohni Tracking.",
  "Gflickt: en Tastedruck oder Wüsche hät d App und damit d Ufnahm chöne beände."),
 "de-AT": ("Austrian German", "Pumpfoil-Recorder für pumpfoil.org",
  "Pumpfoil macht deine Uhr zum Aufnahmegerät fürs Pumpfoilen. Sie zeichnet GPS-Spur, Puls und die Bewegung deines Arms auf und schickt alles an pumpfoil.org, wo Läufe, Pumps und Gleitphasen automatisch erkannt werden.\n\nWährend der Fahrt siehst du Tempo, Puls und Pump-Kadenz — als Zahl oder als Balken, in den Farben deiner eigenen Zonen. Eine Touch-Sperre verhindert, dass Spritzwasser etwas verstellt. Aufnahmen bleiben auf der Uhr, bis sie übertragen sind; eine abgerissene Verbindung kostet dich also nix.\n\nKostenlos, ohne Werbung, ohne Tracking.",
  "Behoben: Tastendruck oder Wischen konnte die App und damit die Aufnahme beenden."),
 "fr": ("French", "Enregistreur pump foil, pumpfoil.org",
  "Pumpfoil transforme ta montre en enregistreur pour le pump foil. Elle enregistre ta trace GPS, ton cardio et le mouvement de ton bras, puis envoie tout à pumpfoil.org, où les runs, les pumps et les phases de glisse sont détectés automatiquement.\n\nPendant la session tu vois vitesse, cardio et cadence de pump, en chiffres ou en barres, aux couleurs de tes zones. Un verrouillage tactile empêche les éclaboussures de tout dérégler. Les enregistrements restent sur la montre jusqu'au transfert : une connexion perdue ne coûte rien.\n\nGratuit, sans publicité, sans traçage.",
  "Corrigé : un appui ou un geste pouvait fermer l'app et arrêter l'enregistrement."),
 "it": ("Italian", "Registratore pump foil, pumpfoil.org",
  "Pumpfoil trasforma il tuo orologio in un registratore per il pump foil. Registra la traccia GPS, il battito e il movimento del braccio, poi manda tutto a pumpfoil.org, dove run, pump e fasi di planata vengono riconosciuti automaticamente.\n\nMentre navighi vedi velocità, battito e cadenza di pump — come numeri o come barre, nei colori delle tue zone. Il blocco touch impedisce che gli schizzi cambino qualcosa. Le registrazioni restano sull'orologio finché non sono trasferite: una connessione persa non ti costa nulla.\n\nGratis, senza pubblicità, senza tracciamento.",
  "Risolto: un tasto o uno swipe poteva chiudere l'app e fermare la registrazione."),
 "es": ("Spanish", "Grabadora pump foil, pumpfoil.org",
  "Pumpfoil convierte tu reloj en una grabadora para pump foil. Registra tu traza GPS, tu frecuencia cardiaca y el movimiento del brazo, y lo envía todo a pumpfoil.org, donde los runs, los pumps y las fases de planeo se detectan automáticamente.\n\nMientras navegas ves velocidad, pulso y cadencia de pump — en números o en barras, con los colores de tus propias zonas. El bloqueo táctil evita que las salpicaduras cambien algo. Las grabaciones se quedan en el reloj hasta transferirse: perder la conexión no te cuesta nada.\n\nGratis, sin publicidad, sin rastreo.",
  "Corregido: un botón o un gesto podía cerrar la app y terminar la grabación."),
 "pt": ("Portuguese", "Gravador de pump foil, pumpfoil.org",
  "O Pumpfoil transforma seu relógio num gravador para pump foil. Ele registra o traçado GPS, os batimentos e o movimento do braço, e manda tudo para pumpfoil.org, onde runs, pumps e fases de planeio são reconhecidos automaticamente.\n\nEnquanto você navega vê velocidade, batimentos e cadência de pump — em números ou em barras, nas cores das suas zonas. O bloqueio de toque impede que respingos mudem alguma coisa. As gravações ficam no relógio até serem transferidas: perder a conexão não custa nada.\n\nGrátis, sem publicidade, sem rastreamento.",
  "Corrigido: um botão ou gesto podia fechar o app e encerrar a gravação."),
 "id": ("Indonesian", "Perekam pump foil, pumpfoil.org",
  "Pumpfoil mengubah jam tanganmu menjadi perekam untuk pump foil. Ia merekam jalur GPS, detak jantung, dan gerakan lenganmu, lalu mengirim semuanya ke pumpfoil.org, tempat run, pump, dan fase meluncur dikenali otomatis.\n\nSelama bermain kamu melihat kecepatan, detak jantung, dan irama pump — sebagai angka atau batang, dengan warna zonamu sendiri. Kunci layar sentuh mencegah cipratan air mengubah apa pun. Rekaman tetap tersimpan di jam sampai terkirim, jadi koneksi yang putus tidak merugikanmu.\n\nGratis, tanpa iklan, tanpa pelacakan.",
  "Diperbaiki: tombol atau usapan bisa menutup aplikasi dan menghentikan rekaman."),
 "ru": ("Russian", "Регистратор пампфойла, pumpfoil.org",
  "Pumpfoil превращает часы в регистратор для пампфойла. Они записывают GPS-трек, пульс и движение руки, а затем отправляют всё на pumpfoil.org, где заезды, пампы и фазы планирования распознаются автоматически.\n\nВо время катания видно скорость, пульс и темп пампов — цифрами или столбиками, в цветах твоих собственных зон. Блокировка касаний не даёт брызгам ничего сбить. Записи остаются на часах, пока не будут переданы, поэтому потеря связи ничего не стоит.\n\nБесплатно, без рекламы, без слежки.",
  "Исправлено: кнопка или свайп могли закрыть приложение и прервать запись."),
 "nl": ("Dutch", "Pump foil-recorder, pumpfoil.org",
  "Pumpfoil maakt van je horloge een recorder voor pump foilen. Het legt je GPS-spoor, je hartslag en de beweging van je arm vast en stuurt alles naar pumpfoil.org, waar runs, pumps en glijfases automatisch worden herkend.\n\nTijdens het varen zie je snelheid, hartslag en pumpcadans — als getal of als balk, in de kleuren van je eigen zones. Een touchvergrendeling voorkomt dat opspattend water iets verzet. Opnames blijven op het horloge tot ze zijn overgezet, dus een weggevallen verbinding kost je niets.\n\nGratis, zonder reclame, zonder tracking.",
  "Opgelost: een knop of veeg kon de app sluiten en de opname beëindigen."),
 "fi": ("Finnish", "Pump foil -tallennin, pumpfoil.org",
  "Pumpfoil tekee kellostasi tallentimen pump foilaukseen. Se tallentaa GPS-jäljen, sykkeen ja käsivartesi liikkeen ja lähettää kaiken pumpfoil.org-palveluun, jossa vedot, pumput ja liitovaiheet tunnistetaan automaattisesti.\n\nVeden päällä näet nopeuden, sykkeen ja pumppaustahdin — lukuina tai palkkeina, omien vyöhykkeidesi väreissä. Kosketuslukko estää roiskeita muuttamasta mitään. Tallenteet säilyvät kellossa kunnes ne on siirretty, joten katkennut yhteys ei maksa sinulle mitään.\n\nIlmainen, ei mainoksia, ei seurantaa.",
  "Korjattu: napin painallus tai pyyhkäisy saattoi sulkea sovelluksen ja tallennuksen."),
 "cs": ("Czech", "Nahrávač pump foilu, pumpfoil.org",
  "Pumpfoil promění tvoje hodinky v nahrávač pro pump foil. Zaznamenají GPS stopu, tep a pohyb tvojí paže a všechno pošlou na pumpfoil.org, kde se jízdy, pumpy a fáze klouzání rozpoznají automaticky.\n\nBěhem jízdy vidíš rychlost, tep a kadenci pumpování — jako číslo nebo jako sloupec, v barvách vlastních zón. Zámek dotyku brání tomu, aby stříkající voda něco přenastavila. Nahrávky zůstávají v hodinkách, dokud se nepřenesou, takže přerušené spojení tě nic nestojí.\n\nZdarma, bez reklam, bez sledování.",
  "Opraveno: tlačítko nebo přejetí mohlo zavřít aplikaci a ukončit nahrávání."),
 "ja": ("Japanese", "パンプフォイル記録 pumpfoil.org",
  "Pumpfoil は時計をパンプフォイル用のレコーダーにします。GPSの軌跡、心拍数、腕の動きを記録し、すべてを pumpfoil.org に送信します。ランやポンプ、グライドの区間は自動で判別されます。\n\n走行中は速度、心拍数、ポンプのテンポを数値または棒グラフで確認できます。色は自分で設定したゾーンの色です。タッチロックがあるので、水しぶきで設定が変わることはありません。記録は送信が終わるまで時計に残るため、接続が切れても失われません。\n\n無料、広告なし、追跡なし。",
  "修正：ボタンやスワイプでアプリが閉じ、記録が止まることがありました。"),
 "zh": ("Chinese (Simplified)", "水翼泵板记录器 pumpfoil.org",
  "Pumpfoil 把你的手表变成水翼泵板的记录器。它记录 GPS 轨迹、心率和手臂动作，并把这些数据发送到 pumpfoil.org，在那里自动识别每段滑行、泵动和滑翔阶段。\n\n滑行时可以看到速度、心率和泵动节奏，以数字或柱状显示，颜色取自你自己设置的区间。触摸锁可以防止水花误触。记录会保存在手表上直到传输完成，因此断开连接不会造成损失。\n\n免费、无广告、无追踪。",
  "已修复：按键或滑动可能关闭应用并中断记录。"),
 "nb": ("Norwegian (Bokmål)", "Pump foil-opptaker, pumpfoil.org",
  "Pumpfoil gjør klokka til et opptaksverktøy for pump foil. Den tar opp GPS-sporet, pulsen og bevegelsen i armen din, og sender alt til pumpfoil.org, der runs, pumps og glidefaser gjenkjennes automatisk.\n\nUnderveis ser du fart, puls og pumpekadens — som tall eller som søyler, i fargene fra dine egne soner. En berøringslås hindrer at vannsprut endrer noe. Opptak blir liggende på klokka til de er overført, så et brutt samband koster deg ingenting.\n\nGratis, uten reklame, uten sporing.",
  "Rettet: et tastetrykk eller sveip kunne lukke appen og avslutte opptaket."),
 "pl": ("Polish", "Rejestrator pump foila, pumpfoil.org",
  "Pumpfoil zamienia twój zegarek w rejestrator do pump foila. Zapisuje ślad GPS, tętno i ruch ramienia, a potem wysyła wszystko na pumpfoil.org, gdzie przejazdy, pompy i fazy szybowania rozpoznawane są automatycznie.\n\nPodczas pływania widzisz prędkość, tętno i kadencję pompowania — jako liczbę albo słupek, w kolorach własnych stref. Blokada dotyku sprawia, że chlapiąca woda niczego nie przestawi. Nagrania zostają w zegarku aż do przesłania, więc zerwane połączenie nic cię nie kosztuje.\n\nZa darmo, bez reklam, bez śledzenia.",
  "Naprawione: przycisk lub gest mógł zamknąć aplikację i przerwać nagrywanie."),
}

# Reihenfolge wie in watch-zepp/page/index.js (LANGS), Englisch vorgezogen — das ist die Sprache,
# die im Store-Formular als Erstes drankommt.
# Kontaktzeile, an JEDEN Details-Text angehaengt. Zepp hat sie am 18.09.2026 in der
# Ablehnung von 1.0.10 angeregt („We recommend adding a feedback email"), und sie ist auch
# ohne Ablehnung richtig: im Zepp-Store gibt es keinen Rueckkanal, der Store verlinkt weder
# unsere Seite noch ein Formular. `info@pumpfoil.org` ist die registrierte Adresse (s. TODO
# 1156). Die Laengenpruefung unten laeuft gegen Text PLUS Zeile — Franzoesisch stand bei
# 599/600 und wurde dafuer gekuerzt.
KONTAKT = {
 "en": "Feedback: info@pumpfoil.org",
 "de": "Feedback: info@pumpfoil.org",
 "gsw": "Feedback: info@pumpfoil.org",
 "de-AT": "Feedback: info@pumpfoil.org",
 "fr": "Contact : info@pumpfoil.org",
 "it": "Contatti: info@pumpfoil.org",
 "es": "Contacto: info@pumpfoil.org",
 "pt": "Contato: info@pumpfoil.org",
 "id": "Masukan: info@pumpfoil.org",
 "ru": "Обратная связь: info@pumpfoil.org",
 "nl": "Feedback: info@pumpfoil.org",
 "fi": "Palaute: info@pumpfoil.org",
 "cs": "Zpětná vazba: info@pumpfoil.org",
 "ja": "お問い合わせ: info@pumpfoil.org",
 "zh": "反馈: info@pumpfoil.org",
 "nb": "Tilbakemelding: info@pumpfoil.org",
 "pl": "Kontakt: info@pumpfoil.org",
}


def details(code: str) -> str:
    """Details-Text plus Kontaktzeile — das ist, was in den Store geht."""
    return TEXTE[code][2] + "\n\n" + KONTAKT[code]


REIHE = ["en", "de", "gsw", "de-AT", "fr", "it", "es", "pt", "id", "ru", "nl", "fi", "cs",
         "ja", "zh", "nb", "pl"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--echt", action="store_true", help="CSV schreiben")
    args = ap.parse_args()

    wurzel = pathlib.Path(__file__).resolve().parents[1]
    fehler = []
    for c in REIHE:
        lang, intro, _, neu = TEXTE[c]
        det = details(c)
        for feld, wert in (("app_name", NAME), ("app_introduction", intro),
                           ("app_details", det), ("new_version_introduction", neu)):
            if len(wert) > GRENZE[feld]:
                fehler.append(f"{c} {feld}: {len(wert)} Zeichen, erlaubt {GRENZE[feld]}")
    if fehler:
        print("ZU LANG — nichts geschrieben:")
        for f in fehler:
            print("  " + f)
        return 1

    print(f"{len(REIHE)} Sprachen, alle innerhalb 30 / 40 / 600 / 100:\n")
    print(f"{'code':<6} {'Sprache':<21} {'Intro':>8} {'Details':>10} {'Neu':>9}")
    for c in REIHE:
        lang, intro, _, neu = TEXTE[c]
        det = details(c)
        print(f"{c:<6} {lang:<21} {len(intro):>5}/40 {len(det):>7}/600 {len(neu):>5}/100")

    # Dateiname traegt die Version aus app.json — sonst heisst die CSV nach drei Einreichungen
    # immer noch „1.0.9" und niemand weiss, welcher Satz im Store steht.
    import json
    ver = json.loads((wurzel / "watch-zepp/app.json").read_text(encoding="utf-8"))["app"]["version"]["name"]
    ziel = wurzel / f"brand/stores/zepp/store-texte-{ver}.csv"
    if args.echt:
        with ziel.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, quoting=csv.QUOTE_ALL)
            w.writerow(["code", "language", "app_name", "app_introduction", "app_details",
                        "new_version_introduction"])
            for c in REIHE:
                lang, intro, _, neu = TEXTE[c]
                w.writerow([c, lang, NAME, intro, details(c), neu])
        print(f"\ngeschrieben: {ziel.relative_to(wurzel)}")
    else:
        print("\nTROCKENLAUF — mit --echt die CSV schreiben.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
