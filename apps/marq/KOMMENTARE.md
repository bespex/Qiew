# Marq: Blöcke kommentieren (Typen `@ai`, `@me`, `@you`)

Stand 2026-11-22. Beschreibung des gebauten Kommentierens in Marq: Format, Einfügestellen, Zusicherungen, sicheres
Schreiben. Der Kern steht in `src/annotate.ts` (Tests `src/annotate.test.ts`), die Anzeige in `src/notes.ts`, das
Schreiben in `src-tauri/src/annotate.rs` und `src/write.ts`, die Bedienung in `src/annotate-ui.ts`. Randknopf,
Eingabekarte und die einzelne Notiz kommen aus dem Rahmen (`@qiew/frame/annotate`), gleich wie in Dirq; Gesten und
Tasten stehen in `docs/BEDIENKONZEPT.md`. Was noch kommen soll, steht in `PLAN.md`.

---

# Was Marq kann

## Entscheidung

**Der Kommentar steht als HTML-Kommentar in der Markdown-Datei**, direkt vor dem Block, auf den er sich bezieht:

```markdown
<!-- @ai: Diesen Absatz auf drei Sätze kürzen, Beispiel streichen. -->

Once, add the be spex repository: …
```

- Die Anzeige des Dokuments ändert sich nicht: HTML-Kommentare sind auf GitHub, in jedem Editor und in Marq
  unsichtbar. Keine Zusatzdatei, `grep "<!-- @"` genügt, und in Dirq ist der Kommentar eine normale Änderung im Diff.
- Der Anker ist die Position im Text. Er wandert mit, wenn der Text verschoben wird. Es gibt nichts wiederzufinden
  und keine verwaisten Kommentare.
- **Marq schreibt nur, wenn es mit `--annotate` gestartet wurde.** Ohne den Parameter bleibt Marq ein reiner Viewer:
  kein „+“, kein Schreibzugriff, Kommentare nur zum Ansehen. Es gibt bewusst keine Einstellung im Programm, die das dauerhaft einschaltet.
- Der Parameter gilt je Aufruf und je geöffnetes Dokument, nicht je Programm. Bekommt ein laufendes Marq per
  `--reuse` ein neues Dokument, schaltet das Fenster entsprechend um.

## Kommentartypen

Ein Kommentar hat einen **Typ**. Er sagt, für wen er gedacht ist, und bestimmt Farbe und Beschriftung.

| Typ | Für wen |
|---|---|
| `@ai` | die KI |
| `@me` | den Schreiber selbst (Merkzettel) |
| `@you` | eine andere Person |

- Die Typen stehen an **einer** Stelle im Code (eine Liste), damit weitere später ohne Umbau dazukommen.
- Marq ändert und löscht **nur Kommentare mit einem bekannten Typ.** Jeder andere HTML-Kommentar (z. B.
  `<!-- markdownlint-disable -->` oder `<!-- @foo … -->`) bleibt unberührt und wird nicht angezeigt.
- Beim Anlegen wählt man den Typ im Eingabefeld. Marq merkt sich den zuletzt gewählten Typ bis zum Beenden.

## Status

Die Syntax ist `@typ#status`. Ohne Status ist der Kommentar **offen**.

| Schreibweise | Bedeutung |
|---|---|
| `<!-- @ai: Text -->` | offen |
| `<!-- @ai#erledigt: Text -->` | erledigt, bleibt in der Datei |

- In Marq gibt es zwei getrennte Handgriffe: **Abhaken** (offen ⇄ erledigt, der Kommentar bleibt stehen) und
  **Löschen** (die Zeilen verschwinden restlos). Marq entscheidet das nie selbst; beides ist ein Klick des Nutzers.
- Erledigte Kommentare werden gedämpft angezeigt (blass, Typfarbe bleibt).
- Beim Lesen tolerant sein: Der Doppelpunkt hinter dem Kopf ist optional (`<!-- @ai bitte prüfen -->` und
  `<!-- @ai#erledigt Text -->` zählen). Der Status steht nach `#` unmittelbar am Typ; als Status zählen nur bekannte
  Wörter (zunächst `erledigt`). Ein unbekanntes Wort (`@ai#foo`) ist kein Status, der Kommentar gilt als offen und
  Marq lässt den Kopf unverändert. Geschrieben wird immer die genaue Form oben.

## Mehrere Kommentare je Block

Erlaubt und unterstützt.

- Alle Kommentare, die unmittelbar vor einem Block stehen (nur Leerzeilen dazwischen), gehören zu diesem Block.
  Die Reihenfolge in der Datei ist die Reihenfolge der Anzeige.
- Ein neuer Kommentar wird **hinter** den vorhandenen, direkt vor dem Block eingefügt (zeitliche Reihenfolge).
- Die Anzeige sammelt sie in einer Randspalte am Block, jeweils mit Typfarbe, Typ, Status und Text.
- Ein Kommentar am Ende eines Containers ohne folgenden Block (z. B. nach dem letzten Absatz eines Zitats, von Hand
  gesetzt) gehört zu keinem Block. Marq zeigt ihn am Ende des Containers, markiert als „ohne Bezug“, und erlaubt
  Löschen.

## Format

Eine Zeile oder mehrere, immer ein eigener HTML-Block:

```
<!-- @ai: Text -->
<!-- @ai: Mehrzeiliger
     Text -->
```

- **Verbotenes Zeichen:** Nur `-->` im Text würde den Kommentar beenden (HTML5 verbietet sonst nichts, `--` ist
  erlaubt). Beim Schreiben `-->` durch `-- >` ersetzen. Das ist weniger Code und im Rohtext lesbarer als Entitäten.
- **Zeilenenden, BOM, letzte Zeile:** Das in der Datei Vorgefundene beibehalten (CRLF bleibt CRLF, kein neues
  Zeilenende am Dateiende, BOM erhalten), sonst entsteht ein Diff über die ganze Datei.

## Wohin genau? Eine Einfügestelle je Blockart

Die Regel: **Das Rendering darf sich durch das Einfügen nicht ändern.** Die Tabelle ist gegen das echte markdown-it
der App geprüft (Stand 2026-11-21, `html: true`). Zeilen ohne „geprüft“ sind noch Annahmen.

| Block | Einfügestelle | Rendering |
|---|---|---|
| Absatz, Überschrift (auch Setext), Tabelle, Fence, Mermaid, HTML-Block | eigene Zeile direkt davor, Leerzeile dazwischen | gleich, geprüft |
| Absatz **im Zitat** | mit demselben Präfix: `> <!-- @ai: … -->` | gleich, geprüft |
| Eingerückter Absatz (in Liste, lose Liste) | gleiche Einrückung wie der Block, Leerzeile dazwischen | gleich, geprüft |
| Ganze Liste | eigene Zeile direkt vor der Liste | gleich, geprüft |
| **Listeneintrag** | als erste Zeile *im* Eintrag, auf Höhe des Texts eingerückt: `- <!-- … -->` ↵ `  Text` | lose Liste gleich; **dichte Liste nur im Leerraum zwischen den Tags anders** (`<li>⏎Text</li>` statt `<li>Text</li>`), geprüft |
| Zelle einer Tabelle | geht nicht; der Kommentar gilt der ganzen Tabelle | siehe Tabelle |
| Block hinter Front Matter | hinter dem Front Matter, nie davor; Blöcke im Front Matter nehmen keinen Kommentar | gleich, geprüft |

**Verboten**, weil nachweislich das Rendering ändernd (geprüft):

- **Zwischen zwei Listeneinträgen** (Zeile in der Spalte der Aufzählungszeichen): beendet die Liste und beginnt eine
  neue. Nummerierte Listen fangen danach mit falscher Zahl wieder an (`<ol start="2">`).
- **Mitten in einem Absatz:** zerreißt den Absatz in zwei. Marq fügt deshalb nur an der Startzeile eines Blocks ein
  (`data-line`, aus `tok.map`), nie an einer Zeile dazwischen.
- **Kommentar und Text auf derselben Zeile** (`- <!-- … -->Text`): Die ganze Zeile wird zum HTML-Block, der Text
  danach wird nicht mehr als Markdown gelesen (Fettdruck, Links gehen verloren).

Innerhalb eines Code-Blocks ist `<!-- … -->` Text. Dort nie einfügen und beim Lesen nie als Kommentar werten
(markdown-it liefert für Fences keinen `html_block`, das ist also von selbst richtig).

## Zusicherungen

Marq sagt dem Nutzer zu, was unten steht. **Jede Zusicherung bekommt einen Test, bevor die Funktion gebaut wird, und
der Test läuft bei jeder Änderung.** Fällt ein Test, wird nicht eingefügt, sondern gemeldet.

| Nr. | Zusicherung | Prüfung |
|---|---|---|
| Z1 | **Einfügen ändert das Rendering nicht.** Das HTML ohne die Kommentarelemente ist gleich dem HTML des Originals. In dichten Listen gilt „gleich bis auf Leerraum zwischen Tags“. | Für jeden Block jeder Testdatei einen Kommentar einfügen, rendern, Kommentarelemente entfernen, vergleichen |
| Z2 | **Einfügen und Löschen ist byte-gleich zum Original.** | Datei einfügen, löschen, Bytes vergleichen |
| Z3 | **Abhaken und wieder Öffnen ist byte-gleich zum Original.** | Kommentar erledigt, wieder offen, Bytes vergleichen |
| Z4 | **Marq verändert nur Kommentarzeilen.** Entfernt man aus Ergebnis und Original alle Zeilen mit bekanntem Kommentartyp, sind beide byte-gleich. Keine Operation zerstört Text daneben. | nach jeder Operation vergleichen |
| Z5 | **Fremde Kommentare bleiben unberührt** (`<!-- markdownlint-disable -->`, `<!-- @foo -->`, Kommentare in Fences). | Testdatei mit solchen Kommentaren, nach jeder Operation byte-gleich in diesen Zeilen |
| Z6 | **Im Zweifel wird nichts geschrieben.** Hat sich die Datei seit dem Rendern geändert und der Block ist nicht eindeutig wiederzufinden, schreibt Marq nichts und meldet es. | Datei zwischen Rendern und Speichern ändern |
| Z7 | **Ohne `--annotate` schreibt Marq nie.** | Testlauf ohne den Parameter: Datei bleibt unverändert, kein Schreibaufruf erreichbar |
| Z8 | **Zeilenenden, BOM und Dateiende bleiben erhalten.** | Testdateien mit CRLF, BOM, ohne letztes Zeilenende |

Testdaten: `example.md` und weitere Dateien mit Listen (dicht, lose, nummeriert, verschachtelt), Zitaten (auch
verschachtelt), Tabellen, Fences, Mermaid, HTML-Blöcken, Front Matter, CRLF, BOM. Dazu Texte mit `-->`, `--`,
Umlauten, sehr langem Text, mehreren Zeilen, mehreren Kommentaren am selben Block.

**Stand der Prüfung:** Z1 bis Z5 und Z8 laufen als Tests im Repo (`apps/marq/src/annotate.test.ts`, Vitest,
`npm test` in `apps/marq`). Testdaten in `apps/marq/test/fixtures/`; jede Datei wird in vier Formen geprüft (LF,
CRLF, BOM, ohne letztes Zeilenende), an jedem kommentierbaren Block mit ein- und mehrzeiligem Kommentar.
Z6 und Z7 kommen mit Schritt 3.

Beim Bauen präzisiert:

- **Z1, Leerraum:** In dichten Listen ändert ein Kommentar auch den Zeilenumbruch vor einem Block im Eintrag
  (`<li>a<ol>` statt `<li>a⏎<ol>`, wenn der Kommentar zwischen Absatz und Unterliste oder Zitat steht). Toleriert
  werden nur Umbrüche direkt nach `<li>` und direkt vor Block-Tags; der Browser zeigt beide nicht.
- **Z4, Listenmarker:** Ein Kommentar für einen Listeneintrag übernimmt dessen Marker (`- <!-- … -->` ↵
  `  Text`). Die Textzeile ändert sich also: Marker wird zu Leerzeichen gleicher Breite (beim Löschen zurück).
  Der Test vergleicht deshalb „ohne Kommentar- und Leerzeilen, Marker als Leerzeichen gelesen“.
- **Abhaken bei unbekanntem Status:** `@ai#foo` gilt als offen. Wieder öffnen ändert nichts; Abhaken ersetzt
  `#foo` durch `#erledigt`.
- **Leerzeilen im Kommentartext** werden beim Schreiben entfernt (eine Leerzeile in einer dichten Liste wäre heikel).
- **Abgelehnt** (Meldung statt Schreiben): Tabs in der Einrückung, Listeneinträge mit leerer erster Zeile, Blöcke
  im Front Matter, Kommentare an Kommentaren.

## Lesen und Anzeigen

- Mit `--annotate`: Ein Block mit Kommentar bekommt einen Streifen im Rand in der Typfarbe und eine Blase mit dem
  Text. Klick öffnet Bearbeiten; dort stehen Abhaken und Löschen.
- Ohne `--annotate` (**entschieden**): Vorhandene Kommentare werden dezent angezeigt (kleiner Marker in der
  Typfarbe, Text beim Überfahren oder Anklicken), aber es gibt **keine Aktionen**: kein „+“, kein Bearbeiten, kein
  Abhaken, kein Löschen. Wer ein Dokument von anderen bekommt, sieht so, dass darin Anweisungen an eine KI stehen.

**Gebaut (Schritt 2), so wie es ohne `--annotate` bleibt:** Die Kommentare vor einem Block werden beim Rendern zu
einer Gruppe von Punkten im linken Rand (je Kommentar ein Punkt in der Typfarbe; erledigt als blasser Ring; ohne
Bezug eckig). Die Gruppe ist absolut positioniert und nimmt keinen Platz ein. Überfahren zeigt eine Karte mit Typ,
Status und Text; Klick heftet sie an, Esc oder Klick daneben schließt. Die Karte entsteht erst beim Öffnen, die
Suche findet Kommentartexte also nur, solange eine Karte offen ist. Im HTML-Export fehlen Punkte und Karte.
Die Typfarben stehen mit in der Typliste (`COMMENT_TYPE_INFO`) und werden mit der Textfarbe gemischt, damit sie in
jedem Farbschema lesbar sind (`light-dark()` greift nicht, weil github-markdown-css auf `.markdown-body` ein
eigenes `color-scheme` nach dem System setzt).

## Schreiben (nur mit `--annotate`)

1. **Hinzufügen:** Beim Überfahren eines Blocks ein „+“ links im Rand (Platz in `styles.css`, `wide.ts` beachten),
   Textfeld unter dem Block mit Typwahl (`@ai`, `@me`, `@you`), Strg+Enter speichert, Esc bricht ab.
2. **Ändern, Abhaken, Löschen:** Der Kommentar ist ein `html_block`-Token mit eigener Zeilenspanne (`tok.map`). Marq
   ersetzt oder löscht genau diese Zeilen (und eine dadurch doppelte Leerzeile). Abhaken ändert nur den Kopf
   (`@ai:` ⇄ `@ai#erledigt:`).
3. **Sicher schreiben:**
   - Beim Speichern die Datei **neu einlesen** und prüfen, ob die Zielzeile noch den erwarteten Anfang des Blocks hat
     (Marq merkt sich beim Rendern den Text der ersten Zeile). Stimmt es nicht, den Block per Text neu suchen; ist
     er nicht eindeutig, nichts schreiben und eine Meldung zeigen (`showMessage`). (Z6)
   - Atomar schreiben: temporäre Datei im selben Ordner, dann umbenennen. Dateirechte erhalten. Ist die Datei ein
     Link, das Ziel schreiben.
   - Nicht beschreibbar: „+“ ausgeblendet oder mit Meldung; kein stilles Scheitern.
   - Vor dem Schreiben Z1 auf das Ergebnis anwenden (Rendering von Original und Neuem vergleichen). Weicht es ab,
     nicht schreiben. Das ist die Laufzeitform der Zusicherung.
4. **Eigenen Reload erkennen:** Nach dem Schreiben die erwartete neue Prüfsumme merken, damit der Live-Reload
   Textfeld oder Scroll nicht zurücksetzt.

**Gebaut (Schritt 3):**

- `--annotate` wird im Rahmen gelesen (`launch.rs`) und gilt je Datei: Marq führt die Menge der freigegebenen
  Dateien (Symlinks aufgelöst). Eine Übergabe per `--reuse` gibt die Datei frei oder nimmt die Freigabe zurück;
  über Links oder Ablegen geöffnete Dateien und Standardeingabe sind nie freigegeben. Ältere Viewer, die bei der
  Übergabe kein `annotate` mitschicken, gelten als „ohne“.
- Das Dokument meldet `annotate` und `writable` an das Frontend; `body.annotate` und `body.annotate-readonly`
  schalten später die Bedienung.
- Schreiben (`annotate.rs`): nur mit Freigabe (Z7, auch der Tauri-Befehl selbst prüft); nur wenn die Datei noch
  der Stand ist, aus dem die Änderung gemacht wurde (sonst ein zweiter Versuch im Frontend, dann Meldung); atomar
  über eine temporäre Datei mit den Rechten des Originals; Symlink bleibt Link, das Ziel wird geschrieben; Dateien
  mit mehreren Namen (Hardlinks) werden an Ort und Stelle geschrieben, damit die Namen zusammenbleiben; nicht
  beschreibbare Dateien werden abgelehnt.
- Z6 im Frontend (`relocateBlock`, `relocateComment`): Hat sich die Datei seit dem Rendern geändert, wird der
  Block über den Text seiner ersten Zeile, ein Kommentar über Kopf und Text wiedergefunden; nur ein eindeutiger
  Treffer zählt.
**Gebaut (Schritt 4):**

- Randknopf: Beim Überfahren eines Blocks erscheint links im Rand ein „+“ (bei einem Block mit Kommentaren unter
  deren Punkten), dazu ein dünner Strich neben dem Block, damit klar ist, wem das „+“ gilt.
- „+“ (Klick oder Taste) an einem Block **mit** Kommentaren legt keinen weiteren an, sondern öffnet den letzten
  offenen zum Ändern (sind alle erledigt, den letzten; Nutzer, 2026-11-26). Einen weiteren gibt es mit Strg+Alt+M oder
  „+ Kommentar“ in der Notizkarte. Der Tooltip des „+“ sagt, was es tut.
- Eingabekarte unter dem Block: Chips `@ai`, `@me`, `@you` (zuletzt gewählter vorbelegt, bis zum Beenden),
  Strg+Enter speichert, Esc bricht ab; Fehler stehen in der Karte, der Text bleibt.
- Notizkarte mit `--annotate`: je Kommentar Abhaken/Wieder öffnen, Bearbeiten (Typ bleibt), Löschen (erster Klick
  fragt, zweiter löscht), unten „+ Kommentar“. Bei schreibgeschützter Datei statt der Knöpfe ein Hinweis.
- Tasten: Strg+Alt+M öffnet die Eingabe für einen **neuen** Kommentar am Block unter dem Zeiger, sonst am ersten sichtbaren; F7 / Umschalt+F7
  springt zum nächsten / vorigen Kommentar und öffnet seine Karte (auch ohne `--annotate`).
- Eigener Reload: Nach dem Schreiben zeigt Marq den neuen Text sofort; ein `file-changed` mit genau diesem Text wird
  übersprungen. Eine offene Notizkarte geht am selben Block wieder auf.
- Live-Reload während des Tippens (die KI ändert die Datei): Randknopf und Eingabekarte liegen auf einer eigenen
  Ebene außerhalb der Seite, der Text bleibt, die Karte findet ihren Block wieder.
- Randknopf, Eingabekarte und die einzelne Notiz kommen seit 2026-11-22 aus dem Rahmen (`@qiew/frame/annotate`,
  dieselben wie in Dirq); Marq legt nur fest, wo sie stehen. Die Texte der Bedienung sind englisch wie der Rest von Marq.

Tasten und Gesten (Randknopf, Eingabekarte, F7 usw.) kommen aus dem Rahmen und stehen in `docs/BEDIENKONZEPT.md`.

## Entschieden (2026-11-21)

- Parametername ist `--annotate`, wie auch in Dirq geplant.
- Vorhandene Kommentare werden auch ohne den Parameter dezent angezeigt, nur ohne Aktionen.
- Anker sind Blöcke (eine Textstelle als Anker steht in `PLAN.md` unter den Brainstorm-Ideen).
- Typen sind `@ai`, `@me`, `@you`. Weitere kommen über die eine Typliste dazu.

## Hinweise für die Umsetzung

- **Messmethode für Z1:** Original und Fassung mit Kommentar mit `new MarkdownIt({ html: true })` rendern, aus dem
  Ergebnis `<!--…-->` samt folgendem Zeilenumbruch entfernen, Zeichenfolgen vergleichen. Für dichte Listen vorher
  Leerraum zwischen Tags vereinheitlichen. Ein Wegwerf-Skript mit den ersten Fällen liegt in `.scratch/probe.mjs`
  (von Git ignoriert, nicht Teil des Repos); die Fälle zu Listeneinträgen stehen nur in der Tabelle oben.
- **Auffälligkeit:** Ein Kommentar mitten in einer Zeile (nicht am Zeilenanfang) ist für markdown-it ein Inline-
  Kommentar, kein Block. Nur am Zeilenanfang entsteht ein `html_block`. Das Lesen sucht deshalb `html_block`.
- **Testrahmen:** Vitest (passt zu Vite), `npm test` in `apps/marq`. Testdateien sind vom `tsc` der App
  ausgenommen (`tsconfig.json`).
- **Aufgabenteilung bleibt:** Teil 1 gehört zu Marq, Teil 2 zu CodeDeck. Der Nutzer hält erledigte Kommentare im Text
  nicht für gut, das ist aber Sache von CodeDeck und kein Marq-Thema.

---

# Was CodeDeck damit macht

CodeDeck startet Marq für Projektdateien mit `--annotate`. Die `@ai`-Kommentare sind dort gewöhnliche Hinweise (Regel
D18, `markers.rs`), auch in Listeneinträgen und Zitaten und mehrzeilig; sie gehen nur mit, wenn der Nutzer sie per
Büroklammer anhängt. Die KI **löscht** einen erledigten Kommentar, sie hakt nicht ab; Abhaken bleibt ein Handgriff des
Nutzers in Marq. Abgehakte Kommentare zählen in CodeDeck nicht als Hinweis. Weiteres auf CodeDeck-Seite steht in
CodeDecks `docs/QIEW.md`.
