# Qiew: Plan für den gemeinsamen Rahmen

Was alle Betrachter teilen (`crates/frame`, `packages/frame`). Was eine einzelne App vorhat, steht in
`apps/<app>/PLAN.md`. Hier steht nur, was kommen soll.

## Brainstorm-Ideen

- **Tastenbelegung prüfen**: Alt+↑/↓ für den nächsten Abschnitt könnte mit Fenstermanagern kollidieren (Alternative
  Strg+↑/↓); Strg+Alt+M fühlt sich unter Linux ungewohnt an (Alternative Strg+Umschalt+M). Die Belegung steht an einer
  Stelle (`packages/frame/src/keys.ts`).
- **Kommentare zu Projektdateien**: Heute nimmt CodeDeck Kommentare nur zu Patches an, die es Dirq gegeben hat
  (Feld `doc`). Für Xaq (siehe dessen `PLAN.md`) und für Elemente, die in Hyqe nur ein Skript erzeugt, trüge die
  Nachricht stattdessen den Pfad der Datei, und CodeDeck nähme Kommentare zu jeder Projektdatei an, die es selbst mit
  `--annotate` geöffnet hat. (Hyqe schreibt Kommentare sonst wie Marq in die Datei, `apps/hyqe/KOMMENTARE.md`.)
- **Weitere Wege zurück zu CodeDeck**: eine Auswahl (Textstelle, Zeilen, Hunk, jq-Ergebnis) als Anhang mit Herkunft
  schicken („An CodeDeck“). Jede Aktion braucht ihre eigene Freigabe und eine Prüfung in CodeDecks Hub.
- **Aussehen wie CodeDeck**: Farbschema und Sprache beim Start mitgeben.
- **Bild-Viewer (zwei neue Apps, Namen offen, etwa Piq und Sviq)**, Brainstorm vom 2026-11-26:
  - **Getrennt**: Pixelbilder (PNG, JPG; dazu, was WebKitGTK ohnehin zeigt: GIF, WebP, BMP, ICO, AVIF je nach Version)
    und SVG. Bei Pixelbildern bezieht sich ein Kommentar auf ein Rechteck, bei SVG auf ein Element. SVG ist Quelltext.
  - **Pixelbilder kommentieren**: Mit `--annotate` zieht der Nutzer einen Rahmen und kommentiert ihn. Der Kommentar geht
    wie bei Dirq an CodeDeck, nicht in die Datei: Metadaten (PNG `iTXt`, JPEG XMP oder IPTC Image Region) sähe die KI
    nicht, und im Diff wären sie unsichtbar. Nachricht etwa
    `{"v":1,"action":"region_comment","source":"piq","id":…,"file":…,"rect":{x,y,w,h},"size":{w,h},"text":…,"doc":…}`.
    CodeDeck schneidet den Ausschnitt selbst aus (oder zeichnet den Rahmen ein) und hängt ihn an den nächsten Prompt;
    der Viewer schreibt nichts. Das braucht „Kommentare zu Projektdateien“ (oben).
  - **SVG kommentieren**: Element anklicken (Brotkrumen, „eine Ebene höher“, Rahmen über mehrere Elemente) und den
    Kommentar wie in Hyqe als `<!-- @ai: … -->` vor das Element schreiben. Wiederverwenden lassen sich Hyqes Elementwahl
    und `annotate.rs` sowie Xaq für den Quelltext. Ein Klick auf ein Element springt zur Zeile im Quelltext.
  - **Für CodeDeck sonst nützlich, nach Nutzen**: Vorher/nachher vergleichen (nebeneinander, Schieberegler, Überblenden,
    Pixel-Differenz; mit `--repo` gegen `HEAD`; Dirq könnte binäre Bildänderungen dorthin abgeben); Live-Reload mit
    Aufblitzen der geänderten Stelle; Pipette und Messen (Hex, Pixelabstände als Text kopieren); Ausschnitt als Anhang
    an CodeDeck; Infofeld (Größe, Transparenz, Farbprofil, Dateigröße, EXIF mit GPS-Warnung); Icons in allen Größen
    auf hellem und dunklem Grund; Bilder im Ordner mit den Pfeiltasten durchblättern.
  - **Einschätzung**: Als reiner Bildbetrachter bringt die App neben Loupe wenig. Der Kern wären der Rahmen-Kommentar an
    CodeDeck und der Vergleich. Reihenfolge: Pixelbilder mit Kommentar, dann Vergleich, dann SVG. Zoomen und Verschieben
    könnten aus Maiqe in den Rahmen wandern.

## Geplante Umsetzungen

### Übergabe nur an ein laufendes Fenster

Eine Option (etwa `--if-running`), mit der `--reuse` das Dokument nur übergibt, wenn schon ein Fenster läuft, und sonst
nichts öffnet. Damit kann CodeDeck eine laufende Runde fortlaufend nachschicken, ohne ein geschlossenes Fenster wieder
aufzumachen (Dirq, „Live in Dirq“).

### Navigationsfeld im Rahmen

Marqs Gliederung (`outline.ts`, Strg+Umschalt+O, anheftbar) wird ein Baustein für alle: in Marq „Gliederung“, in Dirq
„Dateien“, je Eintrag Zähler (Kommentare, Änderungen), unten ein Abschnitt „Kommentare“ (in Dirq nur mit `--annotate`,
in Marq immer). Dirqs Dateiliste und Kommentarliste gehen darin auf.
