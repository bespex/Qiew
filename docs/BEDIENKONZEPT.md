# Qiew: ein Bedienkonzept für Kommentare, Navigation und Zusammenarbeit mit CodeDeck

Stand 2026-11-22. Gebaut: die Tasten an einer Stelle (`packages/frame/src/keys.ts`), Sprungverlauf, Hilfe, Randleiste
und Aufblitzen (Dirq), die Kommentare in Marq, Hyqe und Dirq mit Randknopf, Eingabekarte und Notiz aus dem Rahmen
(`packages/frame/src/annotate.ts`). Das Navigationsfeld im Rahmen ist noch nicht gebaut; es steht wie alles Künftige in
den `PLAN.md`-Dateien (Wurzel und `apps/<app>/`). Einzelheiten zu Marq stehen in `apps/marq/KOMMENTARE.md`, zu den
Freigaben in `docs/ANNOTATE.md`.

## 1. Leitgedanken

1. **Ein Betrachter bleibt ein Betrachter.** Ohne Parameter kann jede App nur, was sie heute kann; Marq zeigt dazu
   vorhandene Kommentare dezent an (nur ansehen). Alles Neue, das schreibt oder sendet, ist **freigegeben**, nicht
   eingestellt.
2. **Freigaben sind Wörter am Start, gesetzt von CodeDeck.** Es gibt drei, mehr nicht:

   | Freigabe | Wer setzt sie | Was sie einschaltet |
   |---|---|---|
   | `--annotate` | CodeDeck | Kommentieren (Marq, Hyqe: in die Datei schreiben; Dirq: an CodeDeck senden) |
   | `CODEDECK_SOCKET=<pfad>` (Umgebung) | CodeDeck | der Rückweg: Knöpfe und Nachrichten für CodeDeck |
   | `--repo <pfad>` | CodeDeck | Dirq darf lesend im Repository nachsehen (Kontext, `.gitattributes`) |

   Eine Freigabe gilt **je Aufruf und je Dokument**, nicht je Programm: Wechselt `--reuse` das Dokument, gilt, was der
   neue Aufruf mitbringt. Es gibt keine Einstellung im Programm, die eine Freigabe dauerhaft erteilt.
3. **Zustand wohnt am Ort, nicht im Dialog.** Ein Kommentar, eine Änderung, ein „neu“ ist dort zu sehen, wo es sich
   befindet (Randstreifen, Blase, Aufblitzen), nicht in einem Fenster, das man öffnen muss.
4. **Ein Vokabular der Gesten.** Dieselbe Geste heißt in jeder App dasselbe (Abschnitt 3).
5. **Die Maus genügt, die Tastatur auch.** Nichts ist nur per Taste erreichbar, nichts nur per Maus.
6. **Weglassen ist ein Entwurfsmittel.** Was keine Freigabe hat, hinterlässt keine leere Stelle: kein ausgegrauter Knopf,
   kein freier Rand. Das Layout einer nicht freigegebenen App bleibt wie heute.

## 2. Bausteine im gemeinsamen Rahmen (`packages/frame`)

Jeder Baustein wird einmal im Rahmen gebaut; die Apps liefern nur *wo* (Ankerpunkte) und *was geschieht* (Rückruf).

| Baustein | Aussehen | Wer nutzt ihn |
|---|---|---|
| **Randknopf** | Beim Überfahren einer Zeile (Dirq), eines Blocks (Marq) oder eines Elements der Seite (Hyqe; Alt+↑/↓ wählt den umgebenden Container) erscheint links im Rand ein kleiner Knopf. In Marq und Hyqe ein „+“: der Kommentar kommt in die Datei. In Dirq eine Sprechblase mit Pfeil, der Tooltip sagt „geht an CodeDeck und mit dem nächsten Prompt an die KI, nicht in den Patch“ (ohne Verbindung: „bleibt nur hier im Fenster“). Das Symbol gibt die App dem Rahmen mit. Klick öffnet die Eingabe; in Marq und Hyqe an einer Stelle, die schon Kommentare hat, zum Ändern des letzten offenen (einen weiteren gibt es mit Strg+Alt+M oder in der Notizkarte). Nur mit `--annotate`. | Marq, Hyqe, Dirq |
| **Eingabekarte** | Kleines Feld direkt unter der Stelle. Strg+Enter speichert/sendet, Esc bricht ab. Mehrzeilig. Optional eine kurze Zeile unter dem Feld; Dirq sagt dort „Goes to CodeDeck, not into the patch.“, sein Knopf heißt „Send to CodeDeck“. In Marq und Hyqe wählt ein Chip vorn den **Typ** (`@ai`, `@me`, `@you`; zuletzt gewählter vorbelegt); in Dirq gibt es keinen Chip. | Marq, Hyqe, Dirq |
| **Notizkarte** | Kommentierte Stelle: farbiger Streifen am Rand, kleine Blase mit Text, ein Klick klappt auf/zu; beim Überfahren Stift und Papierkorb, in Marq und Hyqe zusätzlich ein Haken (Abhaken, `@typ#erledigt`). Ohne `--annotate` zeigen Marq und Hyqe die Blase dezent und ohne diese Knöpfe. | Marq, Hyqe, Dirq |
| **Navigationsfeld links** | Das Gliederungsfeld, das Marq schon hat (`outline.ts`, Strg+Umschalt+O, anheftbar), wird allgemein: in Marq „Gliederung“, in Dirq „Dateien“. Darin je Eintrag Zähler (Kommentare, Änderungen). Unten der Abschnitt „Kommentare“: in Dirq nur mit `--annotate`, in Marq immer (ohne den Parameter nur zum Springen und Ansehen). | Marq, Dirq |
| **Randleiste** | Dünner Streifen rechts am Scrollbalken wie die Übersicht in IDEs: farbige Marken für Änderungen, Kommentare, „neu seit eben“. Klick springt. | Dirq zuerst, Marq (Kommentare) |
| **Aufblitzen** | Nach einem Live-Reload leuchten Blöcke, die neu oder geändert sind, kurz auf und tragen eine Weile eine zarte Marke. Das ist ein kleines Interdiff, das ohne Konzept auskommt. | Dirq (Hunks), Marq (Blöcke) |
| **Sprungverlauf** | Alt+←/→ wie in Marq heute; wird in Dirq für Sprünge (Datei, „verschoben nach …“, Kommentar) übernommen. | Marq, Dirq |
| **Hilfe** | `?` zeigt die Tastenübersicht als Karte über der Seite; jeder Tooltip nennt seine Taste. | alle |

**Warum diese Bausteine elegant sind:** Es gibt *eine* Stelle für Aktionen (den Rand), *eine* für Orientierung (links)
und *eine* für Überblick (rechts). Die Werkzeugleiste bleibt, wie sie ist (README: „eine Werkzeugleiste für alle“); mit
`--annotate` kommt höchstens ein einziger Knopf dazu: die Blase mit der Zahl der Kommentare, ein Klick öffnet den
Abschnitt „Kommentare“ im Feld links. Alles Weitere erscheint nur dort, wo man hinschaut.

## 3. Tasten

Zwei Regeln: **Vertrautes übernehmen** (was Qiew und IDEs schon sagen) und **keine Einzelbuchstaben**, weil man dort
Tippen vermutet und sie sich schlecht merken lassen. Das ersetzt die Buchstaben-Belegung (J/K/N/P/U/V/C/O), die als nicht
intuitiv bewertet wurde. Dazu (2026-11-22): **mit Alt bewegen die Pfeile senkrecht innerhalb** (Änderungen, Überschriften)
**und waagrecht quer** (Dateien eines Patches).

| Taste | Dirq | Marq | Herkunft |
|---|---|---|---|
| **Alt+↓ / Alt+↑** | nächste/vorige Änderung | nächste/vorige Überschrift | innerhalb des Dokuments |
| **F7 / Umschalt+F7** | nächste/vorige Änderung (zusätzlich) | nächster/voriger Kommentar (auch ohne `--annotate`) | IntelliJ |
| **Alt+→ / Alt+←** | nächste/vorige Datei | zurück/vor (gibt es) | Dirq: quer durch den Patch; Marq: Browser |
| **Alt+Umschalt+← / →**, Maustasten zurück/vor | zurück/vor im Sprungverlauf | – | weil Alt+←/→ in Dirq die Dateien sind |
| **Strg+Umschalt+O** | Dateien ein/aus | Gliederung ein/aus (gibt es) | Marq heute |
| **Strg+Alt+M** | Kommentar an der Stelle unter dem Zeiger, sonst an der zuletzt angesprungenen | dasselbe, immer ein neuer (anders als „+“, das einen vorhandenen ändert) | „Kommentar einfügen“ in Word und Docs |
| **Strg+Enter / Esc** | senden / abbrechen | speichern / abbrechen | Strg+Enter heißt in Xaq und Jayq schon „ausführen“ |
| **Strg+F, F3** | Suche | Suche | gibt es |
| **?** | Hilfe | Hilfe | |

Ob Alt+↑/↓ und Strg+Alt+M so bleiben, steht als Brainstorm-Idee im Wurzel-`PLAN.md`.

## 4. Kommentieren als Ganzes

Eine Geste, zwei Wege, ein Ziel: Der Hinweis soll die KI erreichen, ohne dass der Betrachter selbst zum Editor oder zum
Chat wird.

| | **Marq** | **Dirq** |
|---|---|---|
| Medium | Die Markdown-Datei selbst: `<!-- @typ: … -->` vor dem Block (`@typ` = `@ai`, `@me` oder `@you`; Status `@typ#erledigt`) | ein Patch, den niemand pflegt: es gibt nichts, wohin man schreiben könnte |
| Wer speichert | Marq (in die Datei, nur mit `--annotate`) | CodeDeck (wie die Zeilenkommentare im Reiter Änderungen) |
| Wie kommt es zur KI | Die KI liest die Datei; Regel in `CLAUDE.md` | CodeDeck hängt es an den nächsten Prompt (Teil `notes`, `src/notes.ts`: Datei, Zeile, Zeilentext, Text) |
| Anker | der Kommentar steht am Block | Datei + neue Zeilennummer + Text der Zeile; Dirq findet die Zeile über den Text wieder |
| Löschen | Zeilen des Kommentars aus der Datei entfernen (der Nutzer wählt; Marq löscht nie von selbst) | Nachricht `line_comment_remove` mit der `id` an CodeDeck |
| Abhaken | Kopf ändern: `@typ:` ⇄ `@typ#erledigt:`, Kommentar bleibt stehen | – (gibt es in Dirq nicht) |
| Ohne Rückweg | – (Datei genügt) | Kommentare bleiben im Fenster; „Als Liste kopieren“ (Markdown) |
| Was der Nutzer sieht | Randstreifen, Blase, Eingabekarte | **dasselbe** |

So wirken Marq und Dirq gleich, obwohl dahinter zwei Mechanismen stehen. Der Nutzer muss nicht wissen, wohin ein
Kommentar geht; er weiß, **dass** er an der Stelle hängt.

**In Dirq entfällt der Typ.** Jeder Zeilenkommentar von CodeDeck ist ohnehin für die KI. In Marq ist der Typ nötig,
weil Kommentare in einer Datei auch für Menschen sein können: `@ai` für die KI, `@me` für den Schreiber selbst,
`@you` für eine andere Person. Der Typ wird im Eingabefeld per Chip gewählt und bestimmt die Farbe der Blase.

### Dirq im Einzelnen

- **Nachricht an CodeDeck** (Rückweg, eine Zeile JSON):

  ```json
  {"action":"line_comment","source":"dirq","id":"d4f1","file":"src/limit.rs","line":42,"code":"let burst = cfg.burst;","text":"Was, wenn 0?"}
  {"action":"line_comment_remove","source":"dirq","id":"d4f1"}
  ```

  Die `id` vergibt Dirq. CodeDeck braucht deshalb keine Antwort (Entscheidung: kein Rückkanal von CodeDeck zu Dirq,
  vorerst).
- **Seite des Diffs:** Kommentierbar sind Kontext-, hinzugefügte und gelöschte Zeilen. Eine gelöschte Zeile wird mit
  der nächsten Zeile der neuen Seite gesendet, ihr Text beginnt mit `(gelöschte Zeile) ` (`docs/ANNOTATE.md`, 4).
- **Wiederfinden beim Live-Reload:** Die Karten im Fenster hängen an Datei + Zeilentext, nicht an der Zeilennummer. Ändert
  die laufende Runde den Patch (B4), bleiben sie an ihrer Zeile; findet sich der Text nicht mehr, wird die Karte
  gedämpft mit „Zeile geändert“ angezeigt, nicht gelöscht.
- **Neue Runde in einem frischen Patch:** Dirq kennt die alten Kommentare nicht mehr (kein Rückkanal). Sie liegen weiter
  bei CodeDeck, im Reiter Änderungen und im nächsten Prompt. Dass Dirq sie wiedersieht, steht als Idee in
  `apps/dirq/PLAN.md`.

### Marq im Einzelnen

Siehe `apps/marq/KOMMENTARE.md` (Typen, Status, Format, Einfügestelle je Blockart, Zusicherungen, sicheres Schreiben).
Neu aus dem Gesamtbild:
Eingabekarte, Notizkarte und Randknopf kommen aus dem Rahmen und sind **dieselben** wie in Dirq; F7 springt in Marq zum
nächsten Kommentar; Aufblitzen zeigt nach einem Live-Reload, welche Blöcke die KI gerade geändert hat.

### Hyqe im Einzelnen

Siehe `apps/hyqe/KOMMENTARE.md`. Wie Marq, nur an Elementen einer HTML-Seite: Der Kommentar steht vor dem Start-Tag, das
Ziel ist der Inhaltsblock unter dem Zeiger, Alt+↑ / Alt+↓ weitet auf den Container aus und zurück. Randknopf, Marken und
Karten liegen auf einer Ebene über dem Frame der Seite.

## 5. Zusammenarbeit mit CodeDeck: Grundsätze

- **Der Rückweg ist generell da** (im Rahmen: `crates/frame`, `packages/frame`), wird aber **nur dort genutzt, wo er
  freigegeben und sinnvoll ist.** Das heißt jetzt: Zeilenkommentare aus Dirq. „Gesehen“, „Hunk anhängen“, „Hunk
  zurücknehmen“ und „in Editor öffnen“ werden nicht gebaut, bis sie gebraucht werden.
- **Nachrichten laufen in eine Richtung** (Betrachter → CodeDeck). CodeDeck gibt über Startparameter und den Kopf des
  Patches Informationen mit, und über `--reuse` neue Inhalte, aber nichts kommt als Antwort zurück.
- **CodeDeck muss keine neuen Formate verstehen:** für Marq genügt die Suche nach `<!-- @`; für Dirq ist
  `line_comment` das Format, das CodeDeck als `Note` schon kennt.
- **Was CodeDeck für die Freigaben tut** (gebaut, `apps.rs`): `--annotate` für Marq (Markdown-Dateien des Projekts) und
  für Dirq (nur Patches des Arbeitsordners), `CODEDECK_SOCKET` und `--repo` für Dirq. „Live in Dirq“ steht in
  `apps/dirq/PLAN.md`.

## 6. Entschieden und offen

**Entschieden (2026-11-21):**

- Marq zeigt vorhandene Kommentare auch **ohne** `--annotate` dezent an, ohne Aktionen (kein „+“, Bearbeiten,
  Abhaken, Löschen).
- Der Parameter heißt `--annotate`, in Marq und Dirq.
- Marq löscht oder hakt nie von selbst ab; beides wählt der Nutzer. Ob die KI löscht oder abhakt, legt CodeDeck in
  seiner Anleitung fest.

Weiter entschieden (2026-11-21/22): Gelöschte Zeilen sind in Dirq kommentierbar (ohne Feld `side`, die KI liest es aus
dem Text); kommentiert wird je eine Zeile, kein Bereich. Was noch offen ist, steht in den `PLAN.md`-Dateien.
