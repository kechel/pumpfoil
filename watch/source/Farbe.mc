using Toybox.Graphics;

// AKZENTFARBEN — auf den SCHWARZ-WEISS-Uhren alle WEISS (Jan, 26.09.2026: „die farben muessen
// wir komplett ignorieren, es gibt ja nur weiss bei vielen uhren").
//
// Warum: 8 Uhren haben ein 1-Bit-Display (SDK compiler.json `bitsPerPixel: 1`, Palette nur
// 000000/FFFFFF) — Instinct 2/2S/2X, Instinct Crossover, Descent G1, Instinct 3 Solar, Instinct E
// 40/45. Das Geraet rundet jede Farbe auf Schwarz oder Weiss, und Gruen, Rot, Orange, Blau und
// Dunkelgrau landen auf SCHWARZ — auf schwarzem Grund also unsichtbar. Belegt an Jans Instinct 3
// Solar im Emulator: Laufdauer und Laufstrecke (waehrend des Laufs gruen) fehlten ganz, ihre
// hellgrauen Beschriftungen standen da.
//
// Eine Laufzeit-Abfrage der Farbtiefe gibt es in Connect IQ nicht. Deshalb beim BAUEN: das
// Annotationspaar `(:mono)`/`(:farbig)`, die Mono-Uhren schliessen `farbig` aus, alle anderen
// `mono` (monkey.jungle). Konstanten setzt der Compiler ein — kein Byte Code mehr, auch nicht in
// der Lite-Stufe, die am Limit ist. Welche Uhren mono sind, sagt das SDK, nicht wir:
// `check-mono.py` gleicht die monkey.jungle beim Bauen damit ab und bricht sonst ab.
//
// Nur fuer Akzente auf schwarzem Grund. Die inaktiven Seiten-Punkte bleiben dunkelgrau (= auf Mono
// unsichtbar, wie bisher): weiss waeren sie vom aktiven nicht zu unterscheiden.
// ENUM auf OBERSTER Ebene, nicht `const` und nicht in einem Modul: Enum-Werte setzt der Compiler als
// Zahl ein (wie Graphics.COLOR_*). `const` in einem Modul kostete 48 Byte, ein Modul mit Enum
// ebenfalls — das Modul selbst steht mit Namen im Programm (gemessen 26.09.2026). In der Lite-Stufe,
// die am Limit ist, nicht tragbar.
(:farbig) enum {
    FARBE_GRUEN = 0x00FF00, FARBE_ROT = 0xFF0000, FARBE_ORANGE = 0xFF5500, FARBE_GELB = 0xFFAA00,
    FARBE_BLAU = 0x00AAFF,
    FARBE_CYAN = 0x22D3EE,    // = Config.BRAND_CYAN
    FARBE_DUNKEL = 0x555555   // gedimmter HINWEIS-Text — nicht die Seiten-Punkte
}
(:mono) enum {
    FARBE_GRUEN = 0xFFFFFF, FARBE_ROT = 0xFFFFFF, FARBE_ORANGE = 0xFFFFFF, FARBE_GELB = 0xFFFFFF,
    FARBE_BLAU = 0xFFFFFF, FARBE_CYAN = 0xFFFFFF, FARBE_DUNKEL = 0xFFFFFF
}
