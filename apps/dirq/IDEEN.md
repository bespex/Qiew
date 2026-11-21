# Dirq als Review-Werkzeug: Ideen zum Weiterarbeiten

Stand 2026-11-21. Entstanden in einer CodeDeck-Session auf die Frage des Nutzers, wie Dirq das Prüfen von Änderungen
erheblich besser unterstützen kann, allein und zusammen mit CodeDeck. Nichts davon ist beschlossen oder gebaut. Diese
Datei soll eine neue Session in die Lage versetzen, ohne Vorwissen weiterzumachen: erst lesen, dann mit dem Nutzer die
Auswahl treffen, dann Schritt für Schritt bauen. Die Kurzfassung steht im CodeDeck-Repo unter `docs/DIRQ.md`.

## Ausgangslage

**Was Dirq heute kann** (siehe `README.md`): Diff oder Patch nebeneinander oder untereinander, geänderte Wörter markiert
(`inlineDiff` in `src/diff.ts`), ein Kopf mit Betreff, Autor, Datum, Commit, Nachricht und Trailern (`parseHeader`), die
Dateiliste mit Status und Zahlen (`listHtml`), Springen von Änderung zu Änderung mit F7 (`jump`), Leerzeichen ignorieren,
Formate von git, IntelliJ, Subversion und `diff -u`, Suche (aus `@qiew/frame`), Kopieren, Export als eine HTML-Datei,
Live-Reload, lange Dateien starten zugeklappt (`BIG = 4000` Zeilen).

**Aufbau:** Tauri 2 mit Vanilla TypeScript. `src/diff.ts` (≈350 Zeilen) parst den Patch in `Patch` → `FileDiff[]` →
`Hunk[]` → `DiffLine[]` und rechnet die Wortänderungen. `src/main.ts` (≈520 Zeilen) baut das HTML als Zeichenkette
(`tableOf`, `fileHtml`, `metaHtml`, `render`) und verdrahtet Werkzeugleiste, Zuklappen, Springen und Export.
`src-tauri/src/lib.rs` (≈110 Zeilen) öffnet die Datei und nutzt den gemeinsamen Rahmen. Gemeinsames liegt in
`crates/frame` (Rust: Start mit `--line`, `--geometry`, `--reuse`, Standardeingabe, Fensterplatz, Export, About) und
`packages/frame` (TypeScript: Werkzeugleiste, Suche, Zuklappen, Ansichten, Scrollen). Eine Syntaxhervorhebung gibt es in
Qiew noch nirgends.

**Wie CodeDeck Dirq heute nutzt** (CodeDeck `src-tauri/src/apps.rs`, `src/dirq.ts`): `dirq - --reuse` mit dem Patch auf
der Standardeingabe, für eine Runde, einen Commit, einen Snapshot, das nicht Committete, einen Vergleich und einzelne
Dateien. Seit 2026-11-21 steht vor dem Patch ein Kopf im Format von `git format-patch`, den Dirq anzeigt:

```
From <hash, auf 40 Zeichen aufgefüllt> Mon Sep 17 00:00:00 2001
From: Config defaults (C) <codedeck@localhost>
Date: Sat, 21 Nov 2026 11:45:00 +0000
Subject: Runde 6 · Config defaults · orbit-api

Du hast gefragt: Name the limiter settings consistently

<Schlussworte der Session>
---
<der Diff>
```

## Abstimmung vom 2026-11-21 (hat Vorrang vor allem, was weiter unten steht)

Der Nutzer hat die Ideen durchgesehen. Die Abschnitte A und B unten sind der Stand **vor** der Abstimmung und bleiben als
Hintergrund stehen. Das Gesamtbild für Bedienung, Kommentare und CodeDeck steht in `docs/BEDIENKONZEPT.md`.

### Entscheidungen

| Idee | Entscheidung | Anmerkung |
|---|---|---|
| **Kommentare (neu, ersetzt A4)** | **Ja, nur per Parameter `--annotate`** | Nicht in Dirq gespeichert, sondern wie die Zeilenkommentare in CodeDeck (Reiter Änderungen): Dirq sendet sie über den Rückweg, CodeDeck hängt sie an den nächsten Prompt. Siehe `docs/BEDIENKONZEPT.md`, Abschnitt 4. Ohne Rückweg: Kommentare bleiben im Fenster, „als Liste kopieren“. |
| A1 Syntaxhervorhebung | Ja | `highlight.js`; Sprachen siehe unten |
| A2 Gesehen | Vorerst nicht | Damit entfallen auch die Tasten U/V und „ungesehen“ in A6 |
| A3 Tastatur | Ja, **Belegung neu** | Die Buchstaben-Belegung ist verworfen; Vorschlag in `docs/BEDIENKONZEPT.md`, Abschnitt 3 |
| A4 Notizen | In die Kommentare aufgegangen | „Review als Markdown kopieren“ bleibt als Ausweg ohne Rückweg |
| A5 Verschobener Code | Ja, Darstellung muss sehr intuitiv sein | siehe „Darstellung“ unten |
| A6 Generiertes zuklappen | Ja | |
| A7 Dateiliste filtern | Ja | |
| A8 Gliederung aus Hunk-Köpfen | Ja | gleiche Mechanik wie die Gliederung in Marq |
| A9 Mehr Kontext (mit B9) | Ja | CodeDeck liefert `--repo` |
| A10 Serien | Ja, **letzte Phase** | B5 ist dasselbe: A10 ist der Betrachter, CodeDeck liefert nur die Daten (mbox) |
| A11 Diff von Diffs | Interessant, braucht Konzept (auch für CodeDeck); Verständlichkeit darf nicht leiden | Vorstufe „Aufblitzen“ (siehe unten) bringt den Kern ohne Konzept |
| Rückweg | Ja, **generell bauen, nur nutzen wo freigegeben und sinnvoll** | Einrichtung im Rahmen; jetzt genutzt nur für Kommentare. Kein Rückkanal von CodeDeck |
| B1 Notiz wird Zeilenkommentar | Ja (das ist der Anfangswunsch) | siehe Kommentare |
| B2, B3 | Vorerst nicht | |
| B4 Laufende Runde live | **Unbedingt weiter betrachten** | siehe unten |
| B5 Alle Runden als Serie | = A10 | nicht doppelt führen |
| B6 Wer hat welchen Hunk geschrieben | Nicht interessant | |
| B7 An dieser Zeile bearbeiten | Vormerken, nicht weiterverfolgen | |
| B8 Hunk zurücknehmen | Vorerst nicht wichtig | |
| B9 Repository mitgeben | Ja | `--repo <pfad>` |

### Syntaxhervorhebung: Welche Sprachen?

`highlight.js` bringt ein Paket „common“ mit rund 35 Sprachen mit, das unter anderem Java, Kotlin, JavaScript,
TypeScript, Rust, Go, Python, C/C++/C#, SQL, Shell, JSON, YAML, XML/HTML, CSS/SCSS, Markdown, INI/TOML, Makefile, Diff,
PHP, Ruby, Swift enthält. Das deckt das ab, was in den Projekten des Nutzers vorkommt. Als Ergänzung vorgeschlagen:
**Groovy/Gradle, Dockerfile, Properties, Protobuf, Nginx** (einzeln nachladbar, klein). Zu prüfen beim Bauen: welche
davon im Paket schon enthalten sind und wie groß der Bundle wird (Messen, nicht schätzen). Alles Weitere erkennt Dirq
an der Dateiendung nicht und zeigt es ohne Farben, ohne Fehler.

Ein technischer Punkt, der die Umsetzung vereinfacht: **je Hunk die alte und die neue Seite getrennt hervorheben**
(alte Seite = Kontext + gelöschte Zeilen, neue Seite = Kontext + hinzugefügte), dann an den Zeilenenden wieder
zerlegen. So gibt es Zustand über Zeilen (mehrzeilige Kommentare, Zeichenketten) innerhalb des Hunks, ohne die ganze
Datei zu brauchen. Spans, die über ein Zeilenende laufen, müssen je Zeile geschlossen und wieder geöffnet werden.
Mit `--repo` (A9) kann später die ganze Datei hervorgehoben werden.

### Darstellung (intuitiv)

- **Verschobener Code (A5):** eigene Farbe (Blau statt Rot/Grün), damit er sich vom echten Löschen und Hinzufügen
  abhebt. Am Rand ein Pfeil mit dem Ziel („verschoben von src/a.rs:40“); Klick springt dorthin, das Ziel blitzt auf,
  Alt+← geht zurück (Sprungverlauf wie in Marq). In der Dateiliste zählt verschobener Code nicht zu `+`/`−`, sondern
  steht als eigene Zahl („↔ 38“).
- **Generiertes (A6):** eine Zeile „generiert · 1 240 Zeilen · Anzeigen“, statt nichts.
- **Filter (A7):** ein Feld oben in der Dateiliste, Chips für den Status; keine Dialoge.
- **Hunk-Gliederung (A8):** unter jeder Datei die Funktionen als eingerückte Einträge, genau wie Überschriften in
  Marqs Gliederung.
- **Kommentare:** Randknopf „+“, Karte unter der Zeile, Zähler in Dateiliste und Randleiste (siehe
  `docs/BEDIENKONZEPT.md`, Abschnitt 2).

### B4 genauer: die laufende Runde live

Der größte Nutzen bei geringem Aufwand, weil Dirq `--reuse` und `render(keepScroll)` schon hat. Was fehlt:

1. **Stabil bleiben:** Scrollposition am Hunk festmachen (Datei + Text der ersten Zeile), nicht an Pixeln; aufgeklappte
   und zugeklappte Dateien merken; Kommentarkarten über den Zeilentext wiederfinden.
2. **Zeigen, was neu ist („Aufblitzen“):** Beim Neuladen werden Hunks, die vorher nicht da waren oder anders aussehen,
   kurz hervorgehoben und tragen eine zarte „neu“-Marke samt Eintrag in der Randleiste. Dateiliste: Punkt an Dateien mit
   Neuem. Ein Klick auf den Punkt löscht die Marken (eine Taste dafür ist noch offen). Das ist **ein kleines Interdiff
   (A11) ohne Konzept**, weil es nur den vorigen Stand im Fenster mit dem neuen vergleicht, keine zwei Dateien kennt.
3. **CodeDeck-Seite:** ein Schalter „Live in Dirq“ an einer laufenden Runde, der bei jeder Änderung `dirq - --reuse`
   mit dem neuen Patch aufruft. Das ist die Arbeit in CodeDeck (`apps.rs`, `dirq.ts`).

### Prioritäten (Nutzen / Aufwand)

Nutzen 1–5 (5 = trägt das Review), Aufwand 1–5 (1 = ein Nachmittag, 3 = einige Tage, 5 = Wochen, auch in CodeDeck).
„Wert“ ist Nutzen geteilt durch Aufwand, grob gerundet; die Wellen berücksichtigen außerdem, was worauf aufbaut.

| Welle | Idee | Nutzen | Aufwand | Wert | Begründung |
|---|---|---|---|---|---|
| 1 | A6 Generiertes zuklappen | 4 | 1 | 4,0 | Wenige Zeilen, spart sofort Lesezeit |
| 1 | A8 Gliederung aus Hunk-Köpfen | 3 | 1 | 3,0 | Daten sind schon da (`parseHeader`/Hunk-Kopf); Gliederungsfeld kennt Marq |
| 1 | A7 Dateiliste filtern/sortieren | 3 | 1 | 3,0 | Reine Oberfläche |
| 1 | A3 Bedienung: Tasten, Sprungverlauf, Hilfe `?` | 4 | 2 | 2,0 | Legt die Gesten fest, auf denen alles Weitere sitzt |
| 1 | A1 Syntaxhervorhebung | 5 | 3 | 1,7 | Größter Einzelgewinn; im Rahmen gebaut, nützt auch Xaq, Jayq, Marq |
| 2 | **Rückweg im Rahmen** | 4 | 3 | 1,3 | Voraussetzung für Kommentare in Dirq; sonst kein Nutzen für sich |
| 2 | **Kommentare in Dirq** (`--annotate`) | 5 | 2 | 2,5 | Mit Rückweg und Bausteinen (Randknopf, Karte) klein; die Kernidee des Nutzers |
| 2 | **Kommentare in Marq** (`--annotate`, `<!-- @ai -->`) | 5 | 3 | 1,7 | Unabhängig von Dirq; Kern (Einfügen/Entfernen mit Tests) zuerst, kann **parallel** zu Welle 1 beginnen |
| 2 | B4 live: stabil bleiben + Aufblitzen | 5 | 2 | 2,5 | Dirq hat die Grundlage; Rest ist Zustand am Hunk |
| 2 | B9 `--repo` übergeben | 3 | 1 | 3,0 | Nur ein Parameter, öffnet Welle 3; CodeDeck-Seite klein |
| 3 | A5 Verschobener Code | 4 | 3 | 1,3 | Eigener Algorithmus plus Darstellung; hoher Wert bei KI-Umbauten |
| 3 | A9 Mehr Kontext aufklappen | 4 | 3 | 1,3 | Braucht `git` im Rahmen (Frage offen), dann mit `--repo` lesend |
| 4 | A10/B5 Serien von Commits | 3 | 3 | 1,0 | Eigene Ansicht, erst nach dem Rest nötig |
| 4 | A11 Interdiff (zwei Stände) | 4 | 5 | 0,8 | Braucht Konzept auch für CodeDeck; die Vorstufe aus B4 deckt viel ab |
| – | A2, B2, B3, B6, B7, B8 | | | | zurückgestellt oder gestrichen |

Reihenfolge in einem Satz: **erst die billigen Gewinne und die Gesten (Welle 1), dann Kommentare und Live (Welle 2), dann
verschobener Code und Kontext (3), zuletzt Serien und Interdiff (4).** Marq-Kommentare haben keine Abhängigkeit und
können schon in Welle 1 beginnen.

### Neue offene Fragen

- Tastenbelegung (Abschnitt 3 in `docs/BEDIENKONZEPT.md`) bestätigen.
- Gelöschte Zeilen kommentieren? CodeDeck kennt nur die neue Seite (`side: "old"` als Erweiterung vorgeschlagen).
- Darf Dirq `git` aufrufen (A9, nur lesend, nur mit `--repo`)? Heute ruft kein Betrachter git auf.
- Kommentar über mehrere Zeilen (Bereich) oder einzelne Zeilen wie in CodeDeck?
- Soll das „Aufblitzen“ auch ohne `--reuse` und `CODEDECK_SOCKET` laufen, also bei jedem Live-Reload einer Datei?
  (Vorschlag: ja, es braucht keine Freigabe, weil es nur zeigt.)

## Grundsätze, die bei allem gelten

1. **Dirq bleibt ein Betrachter.** Es schreibt nie in die gezeigte Datei und nie in ein Repository. Was es sich merkt
   (gesehen, Notizen), liegt bei Dirq selbst, nicht im Patch.
2. **Eigenständig.** Jede Funktion muss ohne CodeDeck Sinn ergeben, oder sie erscheint nur, wenn CodeDeck Dirq startet
   (siehe „Rückweg“ unten). Ohne CodeDeck gibt es keine Knöpfe für CodeDeck.
3. **Was ins Repository wirkt, tut CodeDeck**, und nur auf ausdrücklichen Wunsch (B8).
4. **Gemeinsames gehört in den Rahmen**, wenn andere Betrachter es auch brauchen (Syntaxhervorhebung: Xaq, Jayq, Marq
   in Codeblöcken; der Rückweg: alle).
5. Die Regeln des Qiew-README gelten: eine Werkzeugleiste für alle, Live-Reload, nur Linux, keine X11-Sonderwege.

## A. Dirq allein

### A1 Syntaxhervorhebung

- **Ziel:** Code liest sich im Review erst mit Farben flüssig. Größter Einzelgewinn.
- **Bedienung:** einfach da, für beide Seiten; Sprache aus der Dateiendung; die Wortmarkierung bleibt sichtbar darüber.
- **Umsetzung:** Bibliothek wählen (Kandidaten: `highlight.js` mit Auswahl an Sprachen, Shiki mit TextMate-Grammatiken,
  oder Lezer). Wichtig: Hervorhebung zeilenweise, aber mit Zustand über Zeilen hinweg (mehrzeilige Kommentare und
  Zeichenketten). Bei einem Hunk fehlt der Anfang der Datei: entweder ab dem Hunk mit leerem Zustand beginnen (meist gut
  genug) oder, mit A9, die ganze Datei hervorheben und die Zeilen herausschneiden. Die Spans der Hervorhebung und die
  Spans von `inlineDiff` müssen sich überlagern: am einfachsten Hervorhebung als Klassen am Text, Wortänderung als
  Hintergrund (CSS Highlight API, wie die Suche in `packages/frame/src/search.ts`, oder verschachtelte Spans).
- **Rahmen:** als `packages/frame/src/highlight.ts`, damit Xaq, Jayq und Marq es auch nutzen können.
- **Farben:** aus den vier Farbschemata von Qiew ableiten.
- **Aufwand:** mittel. **Offen:** welche Bibliothek (Größe des Pakets, Qualität), welche Sprachen mitliefern.

### A2 Datei als gesehen abhaken

- **Ziel:** bei großen Änderungen nichts übersehen und nichts doppelt lesen.
- **Bedienung:** Schalter „Gesehen“ im Kopf jeder Datei (wie in CodeDeck, Reiter Änderungen); die Datei klappt zu. Oben
  „3 von 7 gesehen“, Taste für „nächste ungesehene Datei“. Ändert sich eine gesehene Datei beim Live-Reload, wird sie
  wieder ungesehen und trägt „seit dem Ansehen geändert“.
- **Speicher:** je Datei des Patches ein Fingerabdruck aus Pfad und Inhalt ihres Diffs (Hash über die Hunks). Abgelegt
  bei Dirq, etwa `~/.local/state/dirq/viewed.json`, mit Ablauf nach einigen Wochen. So überlebt es Live-Reload und
  erneutes Öffnen desselben Patches.
- **Aufwand:** klein.

### A3 Tastatur für das Review

- **Ziel:** ein Review ganz ohne Maus.
- **Vorschlag:** `J`/`K` nächste/vorige Änderung (zusätzlich zu F7), `N`/`P` nächste/vorige Datei, `U` nächste ungesehene,
  `V` gesehen umschalten, `C` Notiz (A4), `O` Datei auf/zu, `Shift+O` alle auf/zu. Eine Hilfe-Übersicht mit `?`.
- **Aufwand:** klein. **Offen:** Belegung mit dem Nutzer abstimmen (Konflikte mit der Suche Ctrl+F vermeiden).

### A4 Notizen an Zeilen und Review exportieren

- **Ziel:** Gedanken beim Lesen festhalten, ohne ein anderes Programm.
- **Bedienung:** an einer Zeile ein Symbol wie die Sprechblase in CodeDeck; die Notiz steht unter der Zeile; eine Liste
  aller Notizen in der Seitenleiste. „Review kopieren“ und „Review exportieren“ als Markdown:

  ````markdown
  ## src/limit.rs
  - Zeile 42: `let burst = cfg.burst;` – Was passiert, wenn burst 0 ist?
  ````
- **Speicher:** bei Dirq, je Patch (Fingerabdruck des ganzen Patches) und Zeile; Zeilen über ihren Text wiederfinden,
  falls sich der Patch ändert.
- **Mit CodeDeck:** siehe B1, dort werden Notizen zu Zeilenkommentaren für die KI.
- **Aufwand:** mittel.

### A5 Verschobener Code

- **Ziel:** Umbauten (oft von KI) zeigen Code, der nur den Ort gewechselt hat. Heute erscheint er als gelöscht und neu,
  das Diff wirkt doppelt so groß.
- **Umsetzung:** wie `git diff --color-moved`: gelöschte und hinzugefügte Blöcke über Dateien hinweg vergleichen (ab
  einer Mindestlänge, z. B. 3 Zeilen, Leerzeichen am Rand ignoriert), Paare als „verschoben“ markieren und gegenseitig
  verlinken („verschoben nach src/x.rs:120“). Innerhalb des Blocks geänderte Zeilen trotzdem zeigen.
- **Aufwand:** mittel.

### A6 Generiertes zuklappen

- **Ziel:** das Wesentliche zuerst.
- **Umsetzung:** Liste bekannter Muster (`*.lock`, `package-lock.json`, `Cargo.lock`, `*.min.js`, `*.snap`, `dist/`),
  dazu `linguist-generated` aus einer `.gitattributes`, falls das Repository bekannt ist (A9). Solche Dateien starten
  zugeklappt mit dem Hinweis „generiert“ und zählen in A2 nicht als ungesehen.
- **Aufwand:** klein.

### A7 Dateiliste filtern und sortieren

- **Bedienung:** Feld zum Filtern nach Pfad, Chips für Status (neu, geändert, gelöscht, umbenannt) und „nur ungesehen“;
  Sortierung nach Ordner (heute), nach Größe der Änderung, nach Status.
- **Aufwand:** klein.

### A8 Gliederung aus den Hunk-Köpfen

- **Ziel:** sehen, *was* angefasst wurde, bevor man liest.
- **Umsetzung:** git schreibt in den Hunk-Kopf den Kontext (`@@ -10,6 +10,8 @@ fn rate_limit(`). Je Datei die Liste dieser
  Kontexte als Gliederung in der Dateiliste, klickbar. Ohne Kontext im Kopf: nichts zeigen.
- **Aufwand:** klein.

### A9 Mehr Kontext aufklappen

- **Ziel:** eine Änderung im Zusammenhang verstehen.
- **Umsetzung:** Wenn Dirq das Repository kennt (Option `--repo <pfad>` im Rahmen, oder die Datei liegt in einem
  Repository und die Index-Zeilen `index abc123..def456` passen), holt es die fehlenden Zeilen aus dem Blob (`git cat-file
  -p <blob>`, nur lesend). Zwischen zwei Hunks und am Rand ein Knopf „20 Zeilen mehr“ und „ganze Datei“.
- **Grenze:** ohne Repository bleibt es beim Patch.
- **Aufwand:** mittel. **Offen:** Muss `git` dafür im Rahmen erlaubt werden (heute ruft kein Betrachter git auf)?

### A10 Serien von Commits

- **Ziel:** mehrere Commits oder Runden in einem Fenster lesen.
- **Umsetzung:** Eine Datei mit mehreren Patches (mbox, Ausgabe von `git format-patch --stdout`) als Serie: oben eine
  Liste der Commits mit Betreff, Schritt für Schritt mit Tasten; jede mit ihrem Kopf. Gesehen (A2) je Commit.
- **Aufwand:** mittel.

### A11 Diff von Diffs (interdiff)

- **Ziel:** „Was hat sich seit meinem letzten Review am Vorschlag geändert?“ – bei KI-Arbeit häufig, wenn eine Runde
  nachbessert.
- **Umsetzung:** zwei Fassungen eines Patches vergleichen (zwei Dateien oder zwei Stände desselben Patches beim
  Live-Reload); je Datei zeigen, welche Hunks neu, weg oder geändert sind.
- **Aufwand:** groß.

## B. Zusammen mit CodeDeck

### Der Rückweg (Voraussetzung für B1–B3, B7, B8)

Im Qiew-README unter „Working with CodeDeck“ geplant, noch nicht gebaut:

- CodeDeck startet Dirq mit `CODEDECK_SOCKET=<pfad>` in der Umgebung (CodeDeck hat den Socket bereits, `src-tauri/src/hub.rs`).
- Nur dann zeigt Dirq die Knöpfe für CodeDeck. Ohne die Variable: keine Knöpfe, keine Verbindung.
- Nachrichten sind je eine Zeile JSON, zum Beispiel:

  ```json
  {"action":"add_to_context","source":"dirq","file":"src/limit.rs","selector":"line 42","content":"…"}
  {"action":"line_comment","source":"dirq","file":"src/limit.rs","line":42,"code":"let burst = cfg.burst;","text":"Was, wenn 0?"}
  {"action":"viewed","source":"dirq","file":"src/limit.rs","fingerprint":"…","on":true}
  {"action":"edit_at","source":"dirq","file":"src/limit.rs","line":42}
  {"action":"revert_hunk","source":"dirq","file":"src/limit.rs","hunk":"@@ -40,6 +40,8 @@","patch":"…"}
  ```
- Der Rückweg gehört in den Rahmen (`crates/frame`, `packages/frame`), damit jeder Betrachter ihn bekommt; Dirq nutzt
  nur seine Aktionen. CodeDeck nimmt die Nachrichten an und prüft sie (Pfad im Projekt, bekannte Aktion).
- **Offen:** Rückmeldung von CodeDeck an Dirq (z. B. „angehängt“), also beidseitig? Einfachster Anfang: nur Dirq →
  CodeDeck, CodeDeck meldet sich in seinem eigenen Fenster.

### B1 Notiz wird Zeilenkommentar

Eine Notiz an einer Zeile (A4) geht mit „An CodeDeck“ als Zeilenkommentar an den nächsten Prompt, genau wie die
Sprechblase im Reiter Änderungen (CodeDeck `src/notes.ts`: Datei, Zeile, Code, Text). Dirq muss dafür wissen, welche
Seite (alt/neu) und welche Zeilennummer im Arbeitsordner gemeint ist: die neue Seite.

### B2 „Gesehen“ abgeglichen

Abhaken in Dirq setzt „Angesehen“ in CodeDeck (CodeDeck `src/reviewed.ts`) und umgekehrt. Für die Richtung CodeDeck →
Dirq bräuchte es eine Nachricht an Dirq oder einen Kopf im Patch (`X-CodeDeck-Viewed: src/a.rs src/b.rs`), der beim
Start den Zustand setzt. Der Kopf ist einfacher.

### B3 Hunk oder Datei anhängen

„An CodeDeck“ an einem Hunk oder einer Datei: CodeDeck hängt die Änderung an (wie die Büroklammer in Änderungen, dort als
Git-Befehl; aus Dirq als Text des Hunks mit Datei und Zeilen).

### B4 Die laufende Runde live

CodeDeck schickt den Diff der laufenden Runde bei jeder Änderung neu (`--reuse` übergibt an das offene Fenster). Dirq muss
dabei Scrollposition, aufgeklappte Dateien und Gesehenes behalten (heute: `render(keepScroll)` gibt es schon für
Live-Reload). Auf CodeDeck-Seite: ein Schalter „Live in Dirq“ an einer laufenden Runde.

### B5 Alle Runden als Serie

CodeDeck schickt alle Runden seit dem Commit als Serie (A10), jede mit ihrem Kopf (Runde, Session, Prompt, Schlussworte).
Man blättert die Arbeit einer Session als Geschichte durch.

### B6 Wer hat welchen Hunk geschrieben

CodeDeck kennt je Datei die schreibende Session und über die Snapshots je Runde die Hunks. Als Trailer im Kopf je Datei
(`X-CodeDeck-Session: src/limit.rs C #7f95ff`) zeigt Dirq Kürzel und Farbe der Session an der Datei oder am Hunk, wie in
CodeDeck.

### B7 „An dieser Zeile bearbeiten“

Aus Dirq die Datei im Editor öffnen, den der Nutzer in CodeDeck gewählt hat (CodeDeck `apps.rs`, Rolle „Bearbeiten“).
Allein ginge es auch über das Standardprogramm des Systems, aber ohne Zeile.

### B8 Hunk zurücknehmen

Den guten Teil einer Runde behalten, den schlechten verwerfen: Dirq bittet mit dem Hunk, CodeDeck legt einen Snapshot an
und nimmt den Hunk aus dem Arbeitsordner zurück (`git apply -R` nur dieses Hunks, über `Git::execute`, damit es im
Protokoll steht). Feiner als „eine Datei zurücksetzen“ (CodeDeck `docs/DATEISPALTE.md`, D1). Vorsicht: nur, wenn der Hunk
noch so im Arbeitsordner steht; sonst Fehlermeldung statt Raten.

### B9 Repository mitgeben

CodeDeck startet Dirq mit `--repo <pfad>`; damit gehen A9 (Kontext) und das Erkennen generierter Dateien über
`.gitattributes` (A6).

## Empfohlene Reihenfolge

1. **A1, A2, A3** – Syntaxhervorhebung, Gesehen mit Fortschritt, Tastatur. Damit ist Dirq allein ein Review-Werkzeug.
2. **Rückweg im Rahmen, dann B1, B2, B3** – verbindet das Review in Dirq mit der nächsten Runde der KI.
3. **A4, A5, A6, A8** – Notizen mit Export, verschobener Code, Generiertes zuklappen, Gliederung.
4. **A9/B9, A10/B5, B4, B8** – Kontext, Serien und Runden, live, Hunk zurücknehmen.
5. **A11** – interdiff.

## Für die nächste Session

- Zuerst diese Datei und `README.md` lesen, dann `src/diff.ts` und `src/main.ts` (zusammen unter 900 Zeilen).
- Mit dem Nutzer die Auswahl treffen; offene Fragen oben je Idee klären.
- Bauen: `npm run tauri --workspace apps/dirq -- dev -- -- apps/dirq/example.patch`, prüfen mit `npm run check`.
- Für die Zusammenarbeit mit CodeDeck: dort `src/dirq.ts` (Kopf), `src-tauri/src/apps.rs` (Start), `docs/QIEW.md`,
  `docs/DIRQ.md`.
