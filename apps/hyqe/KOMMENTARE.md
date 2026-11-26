# Hyqe: Elemente einer Seite kommentieren (Typen `@ai`, `@me`, `@you`)

Stand 2026-11-26. Beschreibung des gebauten Kommentierens in Hyqe: Format, Einfügestellen, Wahl des Elements,
Zusicherungen, sicheres Schreiben. Der Kern steht in `src-tauri/src/annotate.rs` (Tests `src-tauri/src/annotate/tests.rs`,
Testseiten `test/fixtures/`), die Seite meldet sich über `src-tauri/src/bridge.js`, die Bedienung steht in
`src/annotate.ts`. Randknopf, Eingabekarte und Notiz kommen aus dem Rahmen (`@qiew/frame/annotate`), das sichere Schreiben
ebenfalls (`crates/frame/src/write.rs`), beides wie in Marq. Vorbild und gemeinsame Regeln: `apps/marq/KOMMENTARE.md`
(Typen, Status, Abhaken, Freigabe) und `docs/ANNOTATE.md` (Bedeutung von `--annotate`).

---

## Entscheidung

**Der Kommentar steht als HTML-Kommentar in der HTML-Datei**, direkt vor dem Start-Tag des Elements, auf das er sich
bezieht:

```html
    <!-- @ai: Den Knopf deutlicher absetzen, Text „Jetzt kaufen“. -->
    <button class="buy">Kaufen</button>
```

- Die Seite sieht unverändert aus: Ein Kommentar ist im DOM ein Knoten ohne Darstellung. `grep "<!-- @"` genügt,
  in Dirq ist er eine normale Änderung, CodeDeck findet `@ai` als Hinweis.
- Der Anker ist die Stelle im Text. Er wandert mit, wenn der Text verschoben wird.
- **Hyqe schreibt nur, wenn es mit `--annotate` für diese Datei gestartet wurde**, und nur in UTF-8-Dateien (ein BOM
  bleibt). Ohne den Parameter bleibt Hyqe ein reiner Viewer: Vorhandene Kommentare werden angezeigt, aber es gibt kein
  „+“ und keine Aktionen.
- Typen (`@ai`, `@me`, `@you`), Status (`@ai#erledigt`), tolerantes Lesen und Schreibweise sind dieselben wie in Marq.

## Welches Element ist gemeint?

Ein Kommentar gehört zu dem Element, **dessen Start-Tag ihm folgt** (dazwischen nur Leerraum und weitere Kommentare).
Folgt kein Start-Tag (Kommentar am Ende eines Elements), hat er keinen Bezug: Hyqe zeigt ihn am Start-Tag davor,
eckig markiert, mit dem Hinweis „No element follows these comments“; Löschen, Ändern und Abhaken gehen trotzdem.

## Seite und Datei: die Anker

Die Seite läuft in einem Frame mit eigenem Ursprung und kennt ihre Quelltextzeilen nicht. Deshalb bekommt die angezeigte
Datei beim Ausliefern an jedes Start-Tag ein Attribut `data-hyqe-at="<Offset>"`: die Stelle seines `<` im Text (Bytes,
UTF-8, ohne BOM). Die Datei selbst bleibt dabei unverändert.

- Nur die angezeigte Datei bekommt Anker, andere HTML-Seiten, zu denen man im Frame wechselt, nicht. Ohne Anker
  (`ready` meldet `anchored: false`) gibt es weder Marken noch „+“.
- Elemente, die ein Skript erst erzeugt, haben keinen Anker. Beim Überfahren wird dann der nächste Vorfahr mit Anker
  gewählt. Klone aus `<template>` tragen den Anker ihrer Vorlage.
- Nach einem eigenen Schreiben lädt die Seite **nicht** neu, sie behält ihren Zustand. Hyqe schickt der Seite stattdessen,
  wie sich die Offsets verschoben haben (`shift`), und der Live-Reload, der darauf folgt, wird übersprungen (gleicher Text).
  Ändert jemand anderes die Datei, lädt die Seite wie bisher neu.

## Wohin genau? Einfügestellen

Regel: **Die Seite darf sich durch das Einfügen nicht ändern** (H1 unten).

| Lage des Start-Tags | Einfügestelle |
|---|---|
| Das Tag beginnt seine Zeile (nur Leerraum davor) | eigene Zeile davor, gleich eingerückt; weitere Zeilen eines mehrzeiligen Kommentars fünf Zeichen tiefer |
| Das Tag steht mitten in einer Zeile (`<li><p>`, `<td>a</td><td>`) | direkt vor das Tag, ohne Leerraum: `<li><!-- @ai: … --><p>` |
| Leerraum vor dem Element ist sichtbar (inline in Fließtext, Eltern mit `white-space: pre*`) | direkt vor das Tag, auch am Zeilenanfang |
| Mehrere Kommentare | ein neuer kommt hinter die vorhandenen, direkt vor das Tag |

Ob Leerraum sichtbar ist, entscheidet die Seite beim Überfahren (`bridge.js`, `wsMatters`: berechneter Stil des Elements
und seiner Eltern, Flex und Grid ignorieren Leerraum). Direkt vor dem Tag ändert sich nicht einmal ein Textknoten.

**Keine Kommentare** nehmen `html`, `head`, `body`, `title`, `meta`, `link`, `base`, `script`, `style`, `noscript` und
`template`. Nie vor `<!DOCTYPE>`, nie in Raw-Text-Elementen (`script`, `style`, `textarea`, `title` …): Dort ist
`<!--` Text, und Hyqe wertet es beim Lesen auch nicht als Kommentar.

## Wahl beim Überfahren

Das Ziel ist der **Inhalt**, die Struktur ist eine Taste entfernt.

1. **Inhaltsblock:** Vom Element unter dem Zeiger aufwärts das erste, das laut berechnetem Stil ein eigener Kasten ist
   (nicht `inline`) und eigenen Text hat (ein Textknoten oder ein Inline-Element mit Text direkt darin): `p`, `h1`–`h6`,
   `li`, `td`, `dd`, ein `div` mit Text. Ebenso eigenständig: Bilder und Grafik (`img`, `svg`, `canvas`, `video` …,
   eine SVG-Zeichnung als Ganzes), Bedienelemente (`button`, `input`, `select` …) und Links, die nicht inline sind.
2. **Sonst** der nächste eigene Kasten (eine Karte, ein leerer Bereich).
3. **Alt+↑ / Alt+↓** weitet auf den umgebenden Container aus und zurück. Hüllen gleicher Größe zählen als ein Schritt
   (die äußere). Ab dem ersten Schritt steht der Pfad an der Linie, etwa `section#zahlen › div.cards`.
4. Ausgelassen werden `html`, `body`, unsichtbare und winzige Elemente (unter 4 px).

## Zusicherungen

Jede Zusicherung hat Tests, die bei jedem `cargo test` laufen, und wird vor jedem Schreiben geprüft.

| Nr. | Zusicherung | Prüfung |
|---|---|---|
| H1 | **Einfügen, Ändern, Abhaken und Löschen ändern die Seite nicht.** Beide Fassungen werden wie im Browser geparst (html5ever über `dom_query`); ohne Kommentare und mit Leerraumfolgen als ein Leerzeichen (außer in `pre`, `textarea`, `listing`, `script`, `style`, `xmp`: dort exakt) müssen die Bäume gleich sein, Template-Inhalte eingeschlossen. Sonst wird nichts geschrieben. | `checked` vor jedem Schreiben; Tests an jedem Element jeder Testseite |
| H2 | **Einfügen und Löschen ist byte-gleich zum Original.** | an jedem Element, ein- und mehrzeilig, mit und ohne `ws` |
| H3 | **Abhaken und wieder Öffnen ist byte-gleich.** | ebenso |
| H4 | **Hyqe verändert nur Kommentartext.** Ohne die Kommentare bekannten Typs sind Ergebnis und Original gleich. | ebenso |
| H5 | **Fremde Kommentare bleiben unberührt** (`<!-- … -->` ohne bekannten Typ, `@foo`, `@aim`, Kommentare in Skripten). | eigener Test |
| H6 | **Im Zweifel wird nichts geschrieben.** Hat sich die Datei seit dem Ausliefern geändert, wird das Start-Tag (der Kommentar) über seinen genauen Text wiedergefunden; nur ein eindeutiger Treffer zählt. Zwischen Lesen und Schreiben darf sich die Datei nicht ändern (Vergleich der Bytes im Rahmen). | eigener Test |
| H7 | **Ohne `--annotate` schreibt Hyqe nie.** Auch die Befehle selbst prüfen die Freigabe. | eigener Test |
| H8 | **Zeilenenden, BOM und Dateiende bleiben.** Neue Zeilen bekommen das erste Zeilenende der Datei. | Testseiten auch mit CRLF |

Leerraum in `<pre>`: Eine eigene Zeile vor einem Element in `<pre>` würde eine Zeile hinzufügen und wird abgelehnt (H1);
direkt vor dem Tag geht es.

## Bedienung

- **Überfahren** (mit `--annotate`): dünne Linie links am Element, „+“ im linken Rand (außerhalb, wenn mindestens 24 px
  Platz sind, sonst knapp innerhalb). Klick oder Taste „+“ öffnet die Eingabekarte unter dem Element; hat es schon
  Kommentare, zum Ändern des letzten offenen (sind alle erledigt, des letzten), wie in Marq. Einen weiteren gibt es mit
  Strg+Alt+M oder „+ Comment“ in der Karte. Die Karte steht unter dem Element (wenn unten kein
  Platz ist, darüber): Chips `@ai`, `@me`, `@you` (zuletzt gewählter vorbelegt), Strg+Enter speichert, Esc bricht ab.
- **Marken:** Ein Element mit Kommentaren hat links einen Punkt je Kommentar in der Typfarbe (erledigt als blasser
  Ring, ohne Bezug eckig). Überfahren zeigt die Karte, Klick heftet sie an; Esc, ein Klick daneben oder in die Seite
  schließt sie. Mit `--annotate` in der Karte je Kommentar Abhaken/Wieder öffnen, Ändern (Typ bleibt), Löschen (erster
  Klick fragt) und unten „+ Comment“; bei schreibgeschützter Datei stattdessen ein Hinweis.
- **Tasten:** „+“ über einem Element; Alt+↑ / Alt+↓ weiter / enger; Strg+Alt+M neuer Kommentar am Element unter dem Zeiger;
  F7 / Umschalt+F7 nächster / voriger Kommentar (auch ohne `--annotate`). Die Seite reicht diese Tasten an Hyqe weiter,
  wenn sie den Fokus hat; in Eingabefeldern der Seite bleibt „+“ ein Pluszeichen.
- Alles liegt auf einer Ebene **über** dem Frame. Die Stile der Seite erreichen sie nicht, und die Seite sieht nichts davon;
  die Positionen meldet die Seite beim Scrollen, bei Größenänderung und alle 600 ms.

## Was CodeDeck damit macht

CodeDeck startet Hyqe für Projektdateien mit `--annotate` (wie Marq). Die `@ai`-Kommentare sind gewöhnliche Hinweise;
in HTML-Dateien zählt ein Kommentar auch mitten in der Zeile (nur nicht direkt nach einem Anführungszeichen, `=`,
`(`, `+` oder `,`, das ist Code), und ein mehrzeiliger kommt mit ganzem Text. Der Auftrag an die KI sagt, dass er dem
Element gilt, dessen Start-Tag folgt. Weiteres steht in CodeDecks `docs/QIEW.md`.
