# Dirq: Umsetzungsplan

Stand 2026-11-21. Grundlage: `IDEEN.md` (Abschnitt „Abstimmung vom 2026-11-21“) und `docs/BEDIENKONZEPT.md`. Gebaut ist noch
nichts. Marq ist nicht Teil dieses Plans (eigene Session, ihre Dateien werden hier **nicht** angefasst); wo der Rahmen gemeinsam ist,
steht es unter „Abstimmung mit der Marq-Session“.

**Verbindliche Parameter-Beschreibung: `docs/ANNOTATE.md`** (was `--annotate`, `--repo` und `CODEDECK_SOCKET` genau
bedeuten, Nachrichtenformat, Verhalten mit `--reuse`, Verträglichkeit, Dokumentationspflichten, Testliste). Wo diese Datei und
`PLAN.md` sich widersprechen, gilt `docs/ANNOTATE.md`. Eine Phase gilt erst als fertig, wenn Code, Tests **und**
Dokumentation nach dessen Abschnitt 8 stehen.

## Entscheidungen, die den Plan bestimmen

| Frage | Entscheidung |
|---|---|
| Tasten | Vorschlag aus dem Bedienkonzept gilt vorerst; Ausprobieren, dann ändern. Die Belegung steht an **einer** Stelle im Rahmen. |
| Gelöschte Zeilen kommentieren | **Ja**, weil ein „+“, das an roten Zeilen fehlt, verwirrt und ein Prüfer dort oft fragen will, warum etwas weg ist. Es geht **ohne Änderung an CodeDeck**: Dirq sendet die Zeilennummer der nächsten Zeile der neuen Seite und setzt vor den Zeilentext `(gelöschte Zeile) `. Die KI versteht das aus dem Text. Ein eigenes Feld `side` ist später möglich, aber nicht nötig. |
| Bereich oder einzelne Zeile | **Einzelne Zeile.** Wer mehr meint, schreibt es in den Kommentar („Zeilen 40–45“). Keine eigene Bedienung für Bereiche; Dirq wäre sonst anders als CodeDeck. Eine Erweiterung bliebe jederzeit möglich. |
| `git` aufrufen | **Ja**, nur lesend (`git cat-file`), nur mit `--repo`, nur in Dirq (kein Rahmen-Befehl für alle). |
| Aufblitzen („neu seit eben“) | **Ja, ohne Freigabe**, bei jedem Live-Reload. Es zeigt nur. |
| Rückkanal von CodeDeck | Nein, vorerst. |
| Session im Patch-Kopf (`X-CodeDeck-Session`) | **Ja**, optional; Dirq sendet sie als Feld `session` mit. Siehe `docs/ANNOTATE.md`, Abschnitt 5. |
| Dokumentation von `--annotate` | **Ausführlich und Teil jeder Phase**: `--help`, README von Dirq, Qiew-README („Working with CodeDeck“), Beschreibung in CodeDeck. Siehe `docs/ANNOTATE.md`, Abschnitte 1 und 8. |

## Reihenfolge nach Nutzen und Aufwand

Jede Phase ist für sich nützlich und kann einzeln veröffentlicht werden. Zuerst die billigen Gewinne, dann die Gesten,
dann das Live-Review, dann die Kommentare, danach alles, was Git oder CodeDeck stärker braucht.

| Phase | Inhalt | Nutzen | Aufwand | Braucht CodeDeck? |
|---|---|---|---|---|
| 1 | Schneller lesen: Generiertes zuklappen, Dateiliste filtern, Gliederung aus Hunk-Köpfen | 4 | 1–2 | nein |
| 2 | Syntaxhervorhebung | 5 | 3 | nein |
| 3 | Gesten: Tasten, Sprungverlauf, Hilfe | 4 | 2 | nein |
| 4 | Live-Review: stabil bleiben, Aufblitzen, Randleiste | 5 | 2–3 | Schalter „Live in Dirq“ (klein) |
| 5 | Kommentare für die KI | 5 | 3 | ja: Annahme im Hub, Anzeige als Zeilenkommentar |
| 6 | Mehr Kontext aus dem Repository | 4 | 3 | ja: `--repo` (ein Parameter) |
| 7 | Verschobener Code | 4 | 3 | nein |
| 8 | Serien von Commits | 3 | 3 | ja: mbox liefern |
| 9 | Diff von Diffs | 4 | 5 | ja: Konzept |

Phase 4 steht vor Phase 5, weil die Kommentarkarten an derselben Technik hängen (Zeilen über ihren Text wiederfinden,
Zustand über ein Neuladen halten).

Für jede Phase gilt: `npm run check` grün, ein Beispiel in `example.patch` oder ein weiteres Beispiel, README und
Kurzbeschreibung der neuen Funktion, Eintrag in den Release-Hinweisen. Wo es reine Funktionen gibt (Muster erkennen,
Hunks vergleichen, Blöcke finden), kommen Tests zuerst.

---

## Phase 1: Schneller lesen

**Dirq**

- **Generiertes zuklappen:** Mustertabelle (`*.lock`, `package-lock.json`, `Cargo.lock`, `*.min.js`, `*.snap`,
  `dist/`) in `src/diff.ts` oder neuer Datei `src/generated.ts`; Datei startet zugeklappt mit einer Zeile
  „generiert · 1 240 Zeilen · Anzeigen“ und zählt weiter in der Summe. Die `BIG`-Regel bleibt daneben bestehen.
- **Dateiliste filtern und sortieren:** Feld oben in `listHtml`, Chips für den Status (neu, geändert, gelöscht,
  umbenannt), Sortierung nach Ordner (heute), Größe der Änderung, Status. Auswahl bleibt über Live-Reload erhalten.
- **Gliederung aus den Hunk-Köpfen:** Der Text hinter `@@ … @@` wird je Datei als eingerückter Eintrag unter der Datei
  gezeigt, klickbar. Ohne Kontext im Kopf: nichts.
- **Test:** Muster (`generated`), Kontext aus Hunk-Köpfen (`parseHeader`-Verwandtes in `diff.ts`).

**CodeDeck:** nichts.

**Abnahme:** Ein Patch mit `Cargo.lock` zeigt diese Datei zugeklappt mit Hinweis; Filter „nur geändert“ blendet neue und
gelöschte aus; Klick auf eine Funktion unter einer Datei springt zum Hunk.

## Phase 2: Syntaxhervorhebung

**Dirq / Rahmen**

- Neues `packages/frame/src/highlight.ts` mit `highlight.js` (Paket „common“ plus Groovy, Dockerfile, Properties,
  Protobuf, Nginx). **Zuerst messen:** Größe des Bundles und welche der Zusatzsprachen schon im Paket sind.
- Je Hunk **alte und neue Seite getrennt** hervorheben (alte Seite: Kontext + gelöschte Zeilen; neue Seite: Kontext +
  hinzugefügte), danach an den Zeilenenden zerlegen. Spans über Zeilenenden je Zeile schließen und wieder öffnen.
- Sprache aus der Dateiendung (und einigen Dateinamen: `Dockerfile`, `Makefile`); unbekannt = keine Farben, kein Fehler.
- Überlagerung mit der Wortmarkierung (`inlineDiff`): Farben als Klassen am Text, Wortänderung als Hintergrund.
- Farben aus den vier Schemata (Soft Light, Soft Dark, Sepia, Slate/Nord).
- Der Export (`exportContent`) enthält die Farben, damit die HTML-Datei gleich aussieht.
- Sehr lange Zeilen und Dateien: Hervorhebung für zugeklappte Dateien erst beim Aufklappen.
- **Test:** Zeilenzerlegung mit mehrzeiligem Kommentar und mehrzeiliger Zeichenkette.

**CodeDeck:** nichts. (Andere Betrachter können `highlight.ts` später nutzen.)

**Abnahme:** Rust-, TypeScript-, Java- und XML-Dateien im Patch sind farbig, ein mehrzeiliger Kommentar über einen
Hunk-Rand hinweg bleibt farbig, die geänderten Wörter sind weiterhin sichtbar markiert, in allen vier Schemata.

## Phase 3: Gesten

**Dirq / Rahmen**

- Tastenbelegung aus dem Bedienkonzept an einer Stelle im Rahmen (`packages/frame/src/keys.ts`): F7/Umschalt+F7 (gibt es),
  Alt+↓/↑ nächste/vorige Datei, Alt+←/→ Sprungverlauf, Strg+Umschalt+O Dateiliste, `?` Hilfe.
- **Sprungverlauf** wie in Marq (`viewer.ts` kennt ihn schon): Sprünge in Dirq (Datei, F7, Klick in der Liste, später
  „verschoben nach“) werden Einträge mit Scrollposition.
- **Hilfe:** Karte mit allen Tasten; Tooltips nennen ihre Taste.
- Die **Dateiliste** wird zum Navigationsfeld wie die Gliederung in Marq (`outline.ts`): anheftbar, beim Überfahren des
  Randes auf. **Mit der Marq-Session klären**, wer diese Verallgemeinerung baut (siehe unten).

**CodeDeck:** nichts.

**Abnahme:** Alle Tasten wirken ohne Maus; Alt+← bringt nach einem Klick in der Dateiliste an die alte Stelle zurück.

## Phase 4: Live-Review

**Dirq**

- **Stabil bleiben:** Scrollposition an einem Hunk festmachen (Datei + Text der ersten Zeile), nicht an Pixeln; auf- und
  zugeklappte Dateien, Filter und Auswahl in der Dateiliste merken. `render(keepScroll)` und `--reuse` gibt es schon.
- **Aufblitzen:** Beim Neuladen den vorigen Stand im Fenster mit dem neuen je Hunk vergleichen (Schlüssel: Datei +
  Hunk-Inhalt). Neue oder geänderte Hunks blitzen kurz auf und tragen eine zarte „neu“-Marke. In der Dateiliste ein
  Punkt an Dateien mit Neuem. Klick auf den Punkt löscht die Marken (Taste dafür offen).
- **Randleiste** rechts am Scrollbalken: Marken für Änderungen und Neues, Klick springt. Wird in Phase 5 um Kommentare
  erweitert.
- **Test:** Vergleich zweier Patch-Stände (neu, entfallen, geändert) als reine Funktion.

**CodeDeck-Folge (klein)**

- Schalter „Live in Dirq“ an der laufenden Runde: bei jeder Änderung, entprellt, `dirq - --reuse` mit dem neuen Patch
  (`src-tauri/src/apps.rs`, `src/dirq.ts`).

**Abnahme:** Läuft eine Runde, springt das Fenster nicht, aufgeklappte Dateien bleiben offen, Neues blitzt auf und lässt
sich in der Randleiste finden. Ohne CodeDeck: dasselbe bei Live-Reload einer Patch-Datei.

## Phase 5: Kommentare für die KI

**Dirq / Rahmen**

- **Rückweg im Rahmen** (`crates/frame` und `packages/frame`): Wenn `CODEDECK_SOCKET` gesetzt ist, verbindet sich
  der Rahmen und schickt je Nachricht eine Zeile JSON. Ohne Variable: keine Verbindung, keine Knöpfe. Nachrichten gehen
  nur in eine Richtung.
- **Freigabe `--annotate`** als Startoption im Rahmen. Ohne sie: kein „+“, nichts anders als heute.
- **Bedienung** (Bausteine des Bedienkonzepts, Abschnitt 2): Randknopf „+“ an Zeilen, Eingabekarte (Strg+Enter sendet,
  Esc bricht ab), Notizkarte mit Streifen und Blase (Klick klappt auf/zu, Stift und Papierkorb beim Überfahren),
  Taste Strg+Alt+M. Kommentierbar sind Kontext-, hinzugefügte **und gelöschte** Zeilen.
- **Nachrichten:** `line_comment` und `line_comment_remove`, je eine Zeile JSON; Felder, Grenzen, Zuordnung neue/alte
  Seite und Fehlerverhalten stehen in `docs/ANNOTATE.md`, Abschnitt 4 (nicht hier wiederholen, damit nichts auseinanderläuft).
  Kurz: `line` ist die Zeile der **neuen** Seite, bei einer gelöschten Zeile die der nächsten dahinter, der `code` beginnt dann
  mit `(gelöschte Zeile) `. Dirq vergibt die `id`; Bearbeiten = entfernen + neu senden.
- **Freigaben reisen mit `--reuse`:** `Handover` in `crates/frame/src/launch.rs` bekommt `annotate`, `codedeck_socket` und
  `repo` (siehe `docs/ANNOTATE.md`, Abschnitt 3). Ohne das gilt die Freigabe nur beim ersten Start eines Fensters und der
  Socket-Pfad wäre nach einem Neustart von CodeDeck tot. **Das ist die Stelle, die man am leichtesten vergisst.**
- **Session:** Zeile `X-CodeDeck-Session` im Patch-Kopf lesen und als `session` mitsenden.
- **Wiederfinden beim Neuladen:** Karten hängen an Datei + Zeilentext, nicht an der Zeilennummer; ist die Zeile weg,
  bleibt die Karte gedämpft mit „Zeile geändert“. (Dieselbe Technik wie das Aufblitzen in Phase 4.)
- **Ohne Rückweg:** Mit `--annotate`, aber ohne `CODEDECK_SOCKET`, bleiben die Kommentare im Fenster; „Als Liste
  kopieren“ erzeugt Markdown (`## src/limit.rs` / `- Zeile 42: …`).
- **Anzeige:** Zähler in der Dateiliste, ein Knopf mit Blase und Zahl in der Werkzeugleiste (öffnet den Abschnitt
  „Kommentare“ im Navigationsfeld), Marken in der Randleiste.
- **Test:** Zusammenbau der Nachricht (Zeilenzuordnung neue/alte Seite), Wiederfinden über Zeilentext.

**CodeDeck-Folge**

- `hub.rs`: `line_comment` und `line_comment_remove` annehmen und prüfen (bekannte Aktion, Pfad im Projekt, Länge des
  Textes) und an das Frontend geben.
- `notes.ts`: eingehende Kommentare als `Note` anlegen (`id` als Text von Dirq statt Zähler oder in beide Richtungen
  abbilden), entfernen über die `id`. Anzeige im Reiter Änderungen und in „Next prompt“ bleibt, wie sie ist.
- `apps.rs`: Dirq mit `--annotate` und `CODEDECK_SOCKET` starten, **nur dort, wo die Zeilennummern zum Arbeitsordner
  passen** (laufende Runde, nicht Committetes). Bei einem alten Commit oder Snapshot beziehen sie sich auf einen anderen
  Stand; dort Dirq ohne `--annotate` starten.
- **Offen:** Welcher Session gehört ein Kommentar? Im Reiter Änderungen hängt das an der Runde (`NoteSessionContext`).
  Vorschlag: CodeDeck schreibt die Session in den Patch-Kopf (`X-CodeDeck-Session: <id>`), Dirq sendet sie in der Nachricht
  mit. Ohne Angabe gilt das bisherige Verhalten.

**Abnahme:** Ein Kommentar in Dirq erscheint ohne weiteres Zutun im Reiter Änderungen und im nächsten Prompt; Entfernen
in Dirq nimmt ihn zurück; ein Kommentar an einer gelöschten Zeile ist für die KI aus dem Text verständlich; ohne
`--annotate` ist Dirq unverändert.

## Phase 6: Mehr Kontext aus dem Repository

**Dirq**

- `--repo <pfad>` als Startoption (nur Dirq). Passen die Index-Zeilen (`index abc123..def456`) zum Repository, holt Dirq
  die fehlenden Zeilen lesend aus dem Blob (`git cat-file -p`, in `src-tauri/src/lib.rs`, kein neuer Befehl für andere
  Betrachter). Zwischen zwei Hunks und am Rand ein Knopf „20 Zeilen mehr“ und „ganze Datei“.
- `.gitattributes` (`linguist-generated`) ergänzt die Mustertabelle aus Phase 1.
- Mit der ganzen Datei kann die Hervorhebung aus Phase 2 sie vollständig statt je Hunk berechnen.
- Fehlt das Repository oder ein Blob: kein Knopf, keine Fehlermeldung.
- **Test:** Zusammensetzen von Hunk und Zeilen aus dem Blob (reine Funktion, mit festen Zeilen).

**CodeDeck-Folge (klein):** `--repo <Projektordner>` beim Start mitgeben (`apps.rs`). Bei eingebetteten Repositories den
passenden Ordner wählen.

**Abnahme:** In einem Hunk lassen sich 20 Zeilen darüber und darunter aufklappen; die Zeilennummern bleiben richtig.

## Phase 7: Verschobener Code

**Dirq**

- Gelöschte und hinzugefügte Blöcke über Dateien hinweg vergleichen (ab 3 Zeilen, Ränder ignoriert), Paare als
  „verschoben“ markieren und verlinken (wie `git diff --color-moved`). Innerhalb des Blocks geänderte Zeilen trotzdem
  zeigen.
- **Darstellung:** eigene Farbe (blau), Pfeil mit dem Ziel am Rand („verschoben von src/a.rs:40“); Klick springt,
  das Ziel blitzt auf, Alt+← geht zurück. In der Dateiliste eine eigene Zahl „↔ 38“; sie zählt nicht zu `+`/`−`.
- **Test:** Algorithmus als reine Funktion (Verschiebung innerhalb einer Datei, über Dateien, mit kleiner Änderung).

**CodeDeck:** nichts.

## Phase 8: Serien von Commits

**Dirq:** Eine Datei mit mehreren Patches (mbox, `git format-patch --stdout`) als Serie: oben die Commits mit Betreff,
Wechsel mit Tasten, je Commit der Kopf.

**CodeDeck-Folge:** alle Runden seit dem Commit als mbox liefern, je Runde mit dem Kopf (Runde, Session, Prompt,
Schlussworte) – das Format steht schon im Kopf einer Runde. Das ist derselbe Wunsch wie „Alle Runden als Serie“.

## Phase 9: Diff von Diffs

Braucht erst ein Konzept, auch für CodeDeck („wann gilt ein Stand als gesehen, wogegen vergleicht man“). Vorarbeit leistet
das Aufblitzen aus Phase 4. Vorher klären: Lässt sich damit schon alles, was gebraucht wird, abdecken? Dann entfällt
Phase 9.

---

## Folgeänderungen für CodeDeck, nach Zeitpunkt

Dirq ist in jeder Phase allein lauffähig. Diese Änderungen in CodeDeck (`src-tauri/src/apps.rs`, `hub.rs`, `src/dirq.ts`,
`src/notes.ts`) sind erst nötig, wenn Dirq die jeweilige Phase hat:

| Wann | Änderung in CodeDeck | Umfang |
|---|---|---|
| Phase 4 | Schalter „Live in Dirq“ an der laufenden Runde, `dirq - --reuse` bei jeder Änderung, entprellt | klein |
| Phase 5 | Hub nimmt `line_comment` / `line_comment_remove` an und prüft sie | klein–mittel |
| Phase 5 | `notes.ts` legt eingehende Kommentare als `Note` an, entfernt sie über die `id` | klein |
| Phase 5 | Start von Dirq mit `--annotate` und `CODEDECK_SOCKET`, nur für Patches, die zum Arbeitsordner passen | klein |
| Phase 5 | optional: `X-CodeDeck-Session` im Patch-Kopf | klein |
| Phase 6 | `--repo <pfad>` beim Start | klein |
| Phase 8 | Runden als mbox | mittel |
| Phase 9 | Konzept „Stand und Vergleich“ | groß |

Nichts davon ändert, wie CodeDeck Dirq heute aufruft. Neue Parameter und die Umgebungsvariable sind Zusätze. **Wichtig, am Code
geprüft (`Launch::parse`):** Ein älteres Dirq **ignoriert unbekannte Optionen still**, es bricht nicht ab und zeigt auch nichts
an. `--annotate` an einem alten Dirq bedeutet also: kein „+“, ohne Hinweis. Deshalb prüft CodeDeck die Fähigkeit vor dem Start
(`dirq --help` nennt `--annotate`) und `--repo <pfad>` steht **nach** dem `-` (sonst hielte ein altes Dirq den Pfad für die
Datei). Einzelheiten: `docs/ANNOTATE.md`, Abschnitt 7.

## Abstimmung mit der Marq-Session

Marq wird in einer anderen Session bearbeitet und teilt sich mit Dirq diese Rahmen-Bausteine:

- Randknopf, Eingabekarte, Notizkarte (Phase 5) und das Navigationsfeld (Phase 3), die Tastenbelegung (`keys.ts`).
- Die Freigabe `--annotate` als Startoption im Rahmen: Name und Wirkung (nur freigeben, nie dauerhaft) müssen gleich sein.

Vorschlag: **Wer zuerst baut, legt die Bausteine in `packages/frame` an**, und die zweite Session nutzt sie. Bevor Phase 3
oder 5 beginnt, einmal prüfen, ob die Marq-Session sie schon angelegt hat, um nicht doppelt zu bauen. Die Marq-Session
sollte wissen, dass `docs/BEDIENKONZEPT.md` die gemeinsamen Gesten beschreibt.

## Für die nächste Session

**Lesereihenfolge:** 1. diese Datei, 2. `docs/ANNOTATE.md` (Parameter, bindend), 3. `apps/dirq/IDEEN.md` (nur der Abschnitt
„Abstimmung vom 2026-11-21“; der Rest ist Hintergrund aus der Zeit vor der Abstimmung), 4. `docs/BEDIENKONZEPT.md` (Gesten,
Rahmenbausteine; **gehört auch der Marq-Session, nicht ändern**), 5. `apps/dirq/README.md`, 6. den Code.

**Regeln dieser Arbeit**

- Nichts in `apps/marq/` ändern. Dateien unter `docs/` nur ergänzen, wenn sie neu sind; `docs/BEDIENKONZEPT.md` gehört beiden.
- Eine Phase nach der anderen; jede einzeln lauffähig, getestet, dokumentiert und mit dem Nutzer abgestimmt, bevor die
  nächste beginnt. Phase 1 zuerst (kleinster Schritt, kein Rahmen nötig).
- Reine Funktionen zuerst mit Tests (`npm run check`).
- Ohne Freigabe ändert sich nichts am Verhalten (`docs/ANNOTATE.md`, Abschnitt 1, Punkt 1). Das ist bei jeder Phase zu prüfen.

**Was am Code geprüft ist (Stand 2026-11-21)** – damit niemand es neu suchen muss:

| Tatsache | Ort |
|---|---|
| Kommandozeile wird von `Launch::parse` gelesen; Optionen mit Wert stehen in `WITH_VALUE`; **unbekannte Optionen werden still ignoriert** | `crates/frame/src/launch.rs` |
| `--reuse`: der Aufrufer übergibt das Dokument per Unix-Socket (`Handover`: `file`, `line`, `geometry`) und beendet sich; das laufende Fenster erhält `open-file` | `crates/frame/src/launch.rs` (`init`, `listen`) |
| `--help` entsteht aus `OPTIONS` (alle Betrachter) plus `AppInfo.options` und `AppInfo.features` der App | `crates/frame/src/help.rs` |
| Rahmen, TypeScript: Werkzeugleiste, Suche, Zuklappen, Ansichten, Sprungverlauf (`viewer.ts`), Start (`launch.ts`) | `packages/frame/src/` |
| Dirq: Parser und Wortdiff in `src/diff.ts` (`parseHeader`, `inlineDiff`), Darstellung in `src/main.ts` (`render`, `listHtml`, `jump`, F7 bei `keydown`), Rust in `src-tauri/src/lib.rs` | `apps/dirq/` |
| CodeDeck startet Dirq mit `dirq - --reuse` und dem Patch auf der Standardeingabe | `CodeDeck/src-tauri/src/apps.rs`, `CodeDeck/src/dirq.ts` |
| CodeDecks Socket heißt `<pid>.sock`, Rechte `0600`; Zeilenkommentare sind `Note` (`path`, `line`, `code`, `text`) | `CodeDeck/src-tauri/src/hub.rs`, `CodeDeck/src/notes.ts` |

**Bauen und prüfen:** `npm run tauri --workspace apps/dirq -- dev -- -- apps/dirq/example.patch`; `npm run check`. Rust-Tests im
Paket des Rahmens (Namen in `crates/frame/Cargo.toml`).

**Was nicht in diesem Plan steht, aber vor Phase 5 mit dem Nutzer zu klären ist:** keine offenen Fragen mehr; die
Festlegungen stehen oben in „Entscheidungen“. Offen bis zum Bauen von Phase 4 ist nur, wann zwei Stände „dasselbe Dokument“
sind (`docs/ANNOTATE.md`, Abschnitt 3, Punkt 5).
